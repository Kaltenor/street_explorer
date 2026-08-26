"""Measure distributed medal definitions and their seeded SQLite footprint."""

from __future__ import annotations

import gzip
import json
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACK_DIRECTORY = ROOT / "country-packs" / "v1"
REPORT_PATH = PACK_DIRECTORY / "medal-storage-report.json"
COUNTRIES = ("fr", "be", "de", "es", "it", "nl")
CURATED_FRANCE_FILES = (
    "paris-v1.json",
    "marseille-v1.json",
    "lyon-v1.json",
    "villeurbanne-v1.json",
    "thonon-les-bains-v1.json",
)


SCHEMA = """
CREATE TABLE medal_albums (
  id TEXT PRIMARY KEY NOT NULL,
  city_id TEXT NOT NULL,
  city_name_json TEXT NOT NULL,
  definition_version INTEGER NOT NULL,
  published_at TEXT NOT NULL,
  source_attribution TEXT NOT NULL,
  city_zone_id TEXT,
  min_latitude REAL,
  max_latitude REAL,
  min_longitude REAL,
  max_longitude REAL
);
CREATE TABLE medals (
  id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL,
  name_json TEXT NOT NULL,
  description_json TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  external_source TEXT NOT NULL,
  external_type TEXT NOT NULL,
  external_id INTEGER NOT NULL
);
CREATE TABLE medal_album_items (
  album_id TEXT NOT NULL,
  medal_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (album_id, medal_id),
  FOREIGN KEY (album_id) REFERENCES medal_albums (id) ON DELETE CASCADE,
  FOREIGN KEY (medal_id) REFERENCES medals (id) ON DELETE CASCADE
);
CREATE INDEX medal_albums_city_zone_index ON medal_albums (city_zone_id);
CREATE INDEX medals_coordinate_index ON medals (latitude, longitude);
"""


def compact_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def load_france() -> tuple[list[dict], int, int, int]:
    generated_paths = sorted((ROOT / "assets" / "medals" / "france").glob("*.json"))
    curated_paths = [ROOT / "assets" / "medals" / name for name in CURATED_FRANCE_FILES]
    paths = generated_paths + curated_paths
    albums = [json.loads(path.read_text(encoding="utf-8")) for path in paths]
    source_bytes = sum(path.stat().st_size for path in paths)
    aggregate = compact_json({"albums": albums, "countryCode": "fr"}).encode("utf-8")
    return albums, source_bytes, len(aggregate), len(gzip.compress(aggregate, mtime=0))


def load_downloadable(country_code: str) -> tuple[list[dict], int, int, int]:
    path = PACK_DIRECTORY / f"{country_code}-v1.json.gz"
    compressed = path.read_bytes()
    expanded = gzip.decompress(compressed)
    pack = json.loads(expanded)
    return pack["albums"], len(compressed), len(expanded), len(compressed)


def create_schema(database_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(database_path)
    connection.execute("PRAGMA page_size = 4096")
    connection.executescript(SCHEMA)
    connection.commit()
    connection.execute("VACUUM")
    return connection


def seeded_sqlite_size(albums: list[dict], directory: Path, country_code: str) -> tuple[int, int]:
    empty_path = directory / f"{country_code}-empty.sqlite"
    empty_connection = create_schema(empty_path)
    empty_connection.close()
    empty_bytes = empty_path.stat().st_size

    database_path = directory / f"{country_code}.sqlite"
    connection = create_schema(database_path)
    with connection:
        for album in albums:
            latitudes = [medal["latitude"] for medal in album["medals"]]
            longitudes = [medal["longitude"] for medal in album["medals"]]
            connection.execute(
                """INSERT INTO medal_albums (
                  id, city_id, city_name_json, definition_version, published_at,
                  source_attribution, city_zone_id, min_latitude, max_latitude,
                  min_longitude, max_longitude
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    album["id"], album["cityId"], compact_json(album["cityName"]),
                    album["version"], album["publishedAt"], album["sourceAttribution"],
                    album["cityZoneId"], min(latitudes), max(latitudes),
                    min(longitudes), max(longitudes),
                ),
            )
            for sort_order, medal in enumerate(album["medals"]):
                identity = medal["externalIdentity"]
                connection.execute(
                    """INSERT OR REPLACE INTO medals (
                      id, category, name_json, description_json, latitude, longitude,
                      external_source, external_type, external_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        medal["id"], medal["category"], compact_json(medal["name"]),
                        compact_json(medal["description"]), medal["latitude"],
                        medal["longitude"], identity["source"], identity["type"],
                        str(identity["id"]),
                    ),
                )
                connection.execute(
                    "INSERT INTO medal_album_items (album_id, medal_id, sort_order) VALUES (?, ?, ?)",
                    (album["id"], medal["id"], sort_order),
                )
    connection.execute("VACUUM")
    connection.close()
    return empty_bytes, database_path.stat().st_size


def main() -> None:
    report = {
        "generatedAt": "2026-08-26T00:00:00.000Z",
        "methodology": {
            "distributedBytes": "Actual bundled JSON bytes for France; published gzip bytes for downloadable countries.",
            "expandedDefinitionBytes": "UTF-8 aggregate JSON for France; gunzipped published JSON for downloadable countries.",
            "referenceGzipBytes": "Deterministic gzip of the France aggregate; identical to distributedBytes for downloadable countries.",
            "sqliteBytes": "Fresh 4096-byte-page SQLite database containing the production medal catalogue tables and indexes after VACUUM.",
        },
        "countries": {},
    }

    temporary_directory = ROOT / ".tmp-medal-storage"
    temporary_directory.mkdir(exist_ok=True)
    try:
        for country_code in COUNTRIES:
            if country_code == "fr":
                albums, distributed, expanded, reference_gzip = load_france()
            else:
                albums, distributed, expanded, reference_gzip = load_downloadable(country_code)
            empty_bytes, sqlite_bytes = seeded_sqlite_size(
                albums, temporary_directory, country_code
            )
            report["countries"][country_code] = {
                "albumCount": len(albums),
                "medalCount": sum(len(album["medals"]) for album in albums),
                "distributedBytes": distributed,
                "expandedDefinitionBytes": expanded,
                "referenceGzipBytes": reference_gzip,
                "sqliteEmptySchemaBytes": empty_bytes,
                "sqliteBytes": sqlite_bytes,
                "sqliteCatalogBytes": sqlite_bytes - empty_bytes,
            }
    finally:
        for temporary_file in temporary_directory.glob("*"):
            temporary_file.unlink()
        temporary_directory.rmdir()

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

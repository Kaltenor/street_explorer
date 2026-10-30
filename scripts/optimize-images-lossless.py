"""Lossless shipping-image optimization. Requires Pillow and zopfli; no resizing."""
import io
import json
from pathlib import Path

from PIL import Image, ImageOps
from zopfli.png import optimize

ROOT = Path(__file__).resolve().parents[1]


def pixels(data):
    with Image.open(io.BytesIO(data)) as image:
        return image.size, ImageOps.exif_transpose(image).convert("RGBA").tobytes()


def strip_jpeg_authoring_metadata(data):
    # Keep EXIF (including orientation), ICC, Adobe color transform and all scans.
    output = bytearray(data[:2])
    offset = 2
    while offset < len(data):
        assert data[offset] == 0xFF
        marker = data[offset + 1]
        if marker in (0xDA, 0xD9):
            output.extend(data[offset:])
            break
        length = int.from_bytes(data[offset + 2:offset + 4], "big")
        segment = data[offset:offset + 2 + length]
        is_xmp = marker == 0xE1 and segment[4:].startswith(b"http://ns.adobe.com/")
        if marker != 0xED and not is_xmp:
            output.extend(segment)
        offset += 2 + length
    return bytes(output)


def main():
    report = []
    for path in sorted((ROOT / "assets").rglob("*")):
        if path.suffix.lower() not in (".png", ".jpg") or path.name == "cartographer-sheet.png":
            continue
        before = path.read_bytes()
        if path.suffix == ".png":
            after = optimize(before, lossy_transparent=False, lossy_8bit=False,
                             keepchunks=["iCCP", "sRGB", "gAMA", "cHRM", "pHYs"],
                             num_iterations=15, num_iterations_large=5)
        else:
            after = strip_jpeg_authoring_metadata(before)
        assert pixels(before) == pixels(after), f"Pixel change: {path}"
        if len(after) < len(before):
            path.write_bytes(after)
        report.append({"path": str(path.relative_to(ROOT)), "before": len(before),
                       "after": min(len(before), len(after)), "identical_rgba": True})
        print(json.dumps(report[-1]), flush=True)
    report_path = ROOT / ".tmp" / "size-0366" / "images.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf8")


if __name__ == "__main__":
    main()

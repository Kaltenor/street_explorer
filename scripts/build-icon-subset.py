"""Generate exact Ionicons glyphs used by app source. Requires fonttools/Pillow."""
import io
import json
from pathlib import Path
import subprocess

from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf"
TARGET = ROOT / "assets/fonts/Ionicons-subset.ttf"


def outline(font, name):
    glyphs = font.getGlyphSet()
    pen = DecomposingRecordingPen(glyphs)
    glyphs[name].draw(pen)
    return pen.value


def main():
    glyphs = json.loads(subprocess.check_output(["node", str(ROOT / "scripts/icon-subset-input.cjs")], cwd=ROOT))
    options = subset.Options()
    options.recalc_timestamp = False
    options.glyph_names = True
    font = TTFont(SOURCE, recalcTimestamp=False)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=set(glyphs.values()))
    subsetter.subset(font)
    output = io.BytesIO()
    font.save(output)
    data = output.getvalue()
    original, reduced = TTFont(SOURCE), TTFont(io.BytesIO(data))
    for codepoint in glyphs.values():
        original_name = original.getBestCmap()[codepoint]
        reduced_name = reduced.getBestCmap()[codepoint]
        assert original["hmtx"][original_name] == reduced["hmtx"][reduced_name]
        assert outline(original, original_name) == outline(reduced, reduced_name)
    for table, attributes in {"head": ["unitsPerEm"], "hhea": ["ascent", "descent", "lineGap"],
                              "OS/2": ["sTypoAscender", "sTypoDescender", "sTypoLineGap", "usWinAscent", "usWinDescent"]}.items():
        for attribute in attributes:
            assert getattr(original[table], attribute) == getattr(reduced[table], attribute)
    for size in (14, 20, 32, 64):
        fonts = (ImageFont.truetype(str(SOURCE), size), ImageFont.truetype(io.BytesIO(data), size))
        for codepoint in glyphs.values():
            rendered = []
            for rendering_font in fonts:
                image = Image.new("RGBA", (128, 128))
                ImageDraw.Draw(image).text((32, 32), chr(codepoint), font=rendering_font, fill="white")
                rendered.append(image.tobytes())
            assert rendered[0] == rendered[1], f"Glyph raster changed: {codepoint} at {size}px"
    TARGET.write_bytes(data)
    (ROOT / "src/data/generated/appIconGlyphs.json").write_text(json.dumps(glyphs, indent=2) + "\n", encoding="utf8")
    print(f"Verified {len(glyphs)} icon names: identical outlines, advances and font metrics; {SOURCE.stat().st_size} -> {TARGET.stat().st_size} bytes")


if __name__ == "__main__":
    main()

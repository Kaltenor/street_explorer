from pathlib import Path

from PIL import Image, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "player" / "cartographer-sheet.png"
DIRECTIONS = ("east", "north", "south", "west")
FRAMES = ("idle", "walk-1", "walk-2", "walk-3")
OUTPUT_SIZE = 64
SUBJECT_SIZE = 56


def subject_bounds(frame: Image.Image):
    # Generated transparency can contain near-invisible alpha noise in gutters.
    # Use the visible silhouette for framing; keep original alpha in the crop.
    return frame.getchannel("A").point(lambda alpha: 255 if alpha > 8 else 0).getbbox()


def fit_frame(frame: Image.Image, scale: float) -> Image.Image:
    bounds = subject_bounds(frame)
    if bounds is None:
        raise ValueError("Generated sprite cell contains no opaque subject")

    subject = frame.crop(bounds)
    size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    # Resampling can eliminate very faint edge pixels from the source alpha.
    # Anchor the actual resized silhouette, not those now-empty padding rows.
    resized_bounds = subject.getchannel("A").getbbox()
    if resized_bounds is None:
        raise ValueError("Sprite vanished while resizing")
    subject = subject.crop(resized_bounds)
    size = subject.size
    output = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
    output.alpha_composite(
        subject,
        ((OUTPUT_SIZE - size[0]) // 2, OUTPUT_SIZE - 4 - size[1]),
    )
    return output


def main() -> None:
    sheet = Image.open(SOURCE).convert("RGBA")
    x_edges = [round(index * sheet.width / 4) for index in range(5)]
    y_edges = [round(index * sheet.height / 4) for index in range(5)]
    cells = [
        sheet.crop((x_edges[column], y_edges[row], x_edges[column + 1], y_edges[row + 1]))
        for row in range(4) for column in range(4)
    ]
    bounds = [subject_bounds(cell) for cell in cells]
    if any(bound is None for bound in bounds):
        raise ValueError("Generated sprite sheet has an empty cell")
    # One scale for the entire character, rather than stretching each gait pose
    # independently. Align boot baselines so walking cannot bob the map anchor.
    scale = SUBJECT_SIZE / max(max(b[2] - b[0], b[3] - b[1]) for b in bounds)

    for row, direction in enumerate(DIRECTIONS):
        for column, frame_name in enumerate(FRAMES):
            cell = sheet.crop(
                (
                    x_edges[column],
                    y_edges[row],
                    x_edges[column + 1],
                    y_edges[row + 1],
                )
            )
            output = fit_frame(cell, scale)
            output.save(
                ROOT / "assets" / "player" / f"native-{frame_name}-{direction}.png"
                if frame_name == "idle"
                else ROOT
                / "assets"
                / "player"
                / f"native-walk-{direction}-{column}.png",
                optimize=True,
            )

        idle = Image.open(
            ROOT / "assets" / "player" / f"native-idle-{direction}.png"
        ).convert("RGBA")
        stale = ImageEnhance.Color(idle).enhance(0.18)
        stale = ImageEnhance.Brightness(stale).enhance(0.72)
        stale.save(
            ROOT / "assets" / "player" / f"native-stale-{direction}.png",
            optimize=True,
        )


if __name__ == "__main__":
    main()

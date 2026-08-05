from pathlib import Path

from PIL import Image, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "player" / "cartographer-sheet.png"
DIRECTIONS = ("east", "north", "south", "west")
FRAMES = ("idle", "walk-1", "walk-2", "walk-3")
OUTPUT_SIZE = 64
SUBJECT_SIZE = 56


def fit_frame(frame: Image.Image) -> Image.Image:
    alpha = frame.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError("Generated sprite cell contains no opaque subject")

    subject = frame.crop(bounds)
    scale = min(SUBJECT_SIZE / subject.width, SUBJECT_SIZE / subject.height)
    size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    output = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
    output.alpha_composite(
        subject,
        ((OUTPUT_SIZE - size[0]) // 2, (OUTPUT_SIZE - size[1]) // 2),
    )
    return output


def main() -> None:
    sheet = Image.open(SOURCE).convert("RGBA")
    x_edges = [round(index * sheet.width / 4) for index in range(5)]
    y_edges = [round(index * sheet.height / 4) for index in range(5)]

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
            output = fit_frame(cell)
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

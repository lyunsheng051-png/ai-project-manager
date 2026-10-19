# /// script
# requires-python = ">=3.12"
# dependencies = ["Pillow>=10"]
# ///
"""Export the project logo as PNG sizes and a Windows application icon.

Usage: uv run scripts/export-icons.py
The artwork in resources/logo.png is the source of truth; this script only
resizes and converts it, preserving its transparent background.
"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
RESOURCES = ROOT / "resources"
SIZES = (16, 20, 24, 32, 40, 48, 64, 96, 128, 256)


def main() -> None:
    with Image.open(RESOURCES / "logo.png") as source:
        logo = source.convert("RGBA")
    if logo.width != logo.height:
        raise ValueError("The source logo must be square.")
    if min(logo.size) < 256:
        raise ValueError("The source logo must be at least 256 × 256 pixels.")

    icon_directory = RESOURCES / "icons"
    icon_directory.mkdir(parents=True, exist_ok=True)
    for size in (*SIZES, 512):
        logo.resize((size, size), Image.Resampling.LANCZOS).save(
            icon_directory / f"icon-{size}.png", optimize=True
        )
    logo.resize((256, 256), Image.Resampling.LANCZOS).save(
        RESOURCES / "icon.png", optimize=True
    )
    logo.save(RESOURCES / "icon.ico", format="ICO", sizes=[(size, size) for size in SIZES])
    print("Exported resources/icon.ico, resources/icon.png and resources/icons/*.png")


if __name__ == "__main__":
    main()

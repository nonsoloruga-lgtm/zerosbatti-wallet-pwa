from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops


REPO_ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = REPO_ROOT / "docs"
ICONS_DIR = DOCS_DIR / "icons"


def _trim_white(img: Image.Image, threshold: int = 8) -> Image.Image:
    """
    Trim (almost) white borders to avoid huge empty margins in icons.
    Works best for logos on white background.
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    diff = ImageChops.difference(img, bg)
    # amplify differences a bit
    diff = ImageChops.add(diff, diff, 2.0, -threshold)
    bbox = diff.getbbox()
    return img.crop(bbox) if bbox else img


def _contain_on_square(img: Image.Image, size: int, pad: float = 0.12) -> Image.Image:
    """Fit logo into a square canvas with padding."""
    img = img.convert("RGBA")
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    inner = int(size * (1 - 2 * pad))
    w, h = img.size
    scale = min(inner / w, inner / h)
    nw = max(1, int(w * scale))
    nh = max(1, int(h * scale))
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    ox = (size - nw) // 2
    oy = (size - nh) // 2
    canvas.alpha_composite(resized, (ox, oy))
    return canvas


def _maskable(img: Image.Image, size: int, bg=(127, 216, 214, 255), scale: float = 0.78) -> Image.Image:
    """Create a maskable icon by putting the logo on a solid background with safe padding."""
    img = img.convert("RGBA")
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * scale)
    w, h = img.size
    s = min(inner / w, inner / h)
    nw = max(1, int(w * s))
    nh = max(1, int(h * s))
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    ox = (size - nw) // 2
    oy = (size - nh) // 2
    canvas.alpha_composite(resized, (ox, oy))
    return canvas


def _save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate PWA icons for ZeroSbatti Wallet.")
    parser.add_argument(
        "--src",
        default=str(REPO_ROOT / "tools" / "logo-source.png"),
        help="Path to the source logo image (PNG recommended).",
    )
    parser.add_argument(
        "--no-trim",
        action="store_true",
        help="Do not auto-trim white margins.",
    )
    args = parser.parse_args()

    src_path = Path(args.src)
    if not src_path.is_absolute():
        src_path = (REPO_ROOT / src_path).resolve()
    if not src_path.exists():
        raise SystemExit(f"Source logo not found: {src_path}")

    img = Image.open(src_path)
    img.load()
    img = img.convert("RGBA")
    if not args.no_trim:
        img = _trim_white(img)

    # PWA icons
    _save_png(_contain_on_square(img, 192), ICONS_DIR / "icon-192.png")
    _save_png(_contain_on_square(img, 512), ICONS_DIR / "icon-512.png")
    _save_png(_contain_on_square(img, 768), ICONS_DIR / "icon-768.png")

    # Maskable icons
    _save_png(_maskable(img, 192), ICONS_DIR / "icon-192-maskable.png")
    _save_png(_maskable(img, 512), ICONS_DIR / "icon-512-maskable.png")

    # iOS icons
    _save_png(_contain_on_square(img, 180, pad=0.10), ICONS_DIR / "apple-touch-icon.png")
    _save_png(_contain_on_square(img, 167, pad=0.10), ICONS_DIR / "icon-167.png")
    _save_png(_contain_on_square(img, 152, pad=0.10), ICONS_DIR / "icon-152.png")

    print("OK: icons generated in", ICONS_DIR)


if __name__ == "__main__":
    main()


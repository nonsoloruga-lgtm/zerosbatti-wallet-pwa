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


def _crop_to_main_block(img: Image.Image) -> Image.Image:
    """
    Heuristic crop to the "main" block of content (e.g. symbol) and ignore
    secondary blocks (e.g. text below). Works best for logos on white background.
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    w, h = img.size
    px = img.load()

    def is_fg(r: int, g: int, b: int, a: int) -> bool:
        if a < 10:
            return False
        # treat near-white as background
        return not (r > 245 and g > 245 and b > 245)

    # Count foreground pixels per row
    row_counts: list[int] = []
    for y in range(h):
        c = 0
        for x in range(w):
            r, g, b, a = px[x, y]
            if is_fg(r, g, b, a):
                c += 1
        row_counts.append(c)

    # Find contiguous segments of foreground rows
    min_row = max(10, int(w * 0.005))
    segments: list[tuple[int, int]] = []
    in_seg = False
    start = 0
    for y, c in enumerate(row_counts):
        if c >= min_row and not in_seg:
            in_seg = True
            start = y
        elif (c < min_row) and in_seg:
            in_seg = False
            segments.append((start, y - 1))
    if in_seg:
        segments.append((start, h - 1))

    if len(segments) <= 1:
        return img

    # Score segments by total foreground area; keep the largest
    best = None
    best_score = -1
    for a, b in segments:
        score = sum(row_counts[a : b + 1])
        if score > best_score:
            best_score = score
            best = (a, b)

    if not best:
        return img

    top, bottom = best
    pad = max(0, int(h * 0.01))
    top = max(0, top - pad)
    bottom = min(h - 1, bottom + pad)
    return img.crop((0, top, w, bottom + 1))


def _contain_on_square(img: Image.Image, size: int, pad: float = 0.06) -> Image.Image:
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
    parser.add_argument(
        "--keep-text",
        action="store_true",
        help="Do not auto-crop away a secondary text block (if present).",
    )
    parser.add_argument(
        "--pad",
        type=float,
        default=0.06,
        help="Padding around the logo when fitting into the square (default: 0.06).",
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
    if not args.keep_text:
        img = _crop_to_main_block(img)

    # PWA icons
    _save_png(_contain_on_square(img, 192, pad=args.pad), ICONS_DIR / "icon-192.png")
    _save_png(_contain_on_square(img, 512, pad=args.pad), ICONS_DIR / "icon-512.png")
    _save_png(_contain_on_square(img, 768, pad=args.pad), ICONS_DIR / "icon-768.png")

    # Maskable icons
    _save_png(_maskable(img, 192, scale=0.90), ICONS_DIR / "icon-192-maskable.png")
    _save_png(_maskable(img, 512, scale=0.90), ICONS_DIR / "icon-512-maskable.png")

    # iOS icons
    _save_png(_contain_on_square(img, 180, pad=max(0.04, args.pad - 0.02)), ICONS_DIR / "apple-touch-icon.png")
    _save_png(_contain_on_square(img, 167, pad=max(0.04, args.pad - 0.02)), ICONS_DIR / "icon-167.png")
    _save_png(_contain_on_square(img, 152, pad=max(0.04, args.pad - 0.02)), ICONS_DIR / "icon-152.png")

    print("OK: icons generated in", ICONS_DIR)


if __name__ == "__main__":
    main()

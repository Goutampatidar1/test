"""Generate square bag-only favicons (no wordmark text — readable at 16–48px)."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "public",
    ROOT.parent / "AdminPannel" / "public",
    ROOT.parent / "VenueVendorPanel" / "public",
]


def draw_bag_mark(size: int) -> Image.Image:
    """Official shopping-bag mark on black — matches favicon.svg."""
    img = Image.new("RGBA", (size, size), (20, 20, 20, 255))
    draw = ImageDraw.Draw(img)
    w = max(2, size // 16)

    # Bag body outline (trapezoid-ish rounded rect)
    left, right = size * 0.22, size * 0.78
    top, bottom = size * 0.36, size * 0.86
    draw.rounded_rectangle(
        [left, top, right, bottom],
        radius=size * 0.06,
        outline=(255, 138, 0, 255),
        width=w,
    )

    # Handle
    hx0, hx1 = size * 0.34, size * 0.66
    hy0, hy1 = size * 0.10, size * 0.42
    draw.arc([hx0, hy0, hx1, hy1], start=200, end=340, fill=(255, 213, 74, 255), width=w)

    # Accent dots
    r = max(1, size // 22)
    for cx in (size * 0.38, size * 0.62):
        cy = size * 0.58
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(212, 225, 87, 255))

    return img


def main() -> None:
    sizes = [16, 32, 48, 180, 192, 512]

    for out in TARGETS:
        out.mkdir(parents=True, exist_ok=True)
        imgs = {s: draw_bag_mark(s) for s in sizes}

        imgs[32].save(out / "favicon-32.png", optimize=True)
        imgs[48].save(out / "favicon-48.png", optimize=True)
        imgs[180].save(out / "apple-touch-icon.png", optimize=True)
        imgs[192].save(out / "favicon-192.png", optimize=True)
        imgs[512].save(out / "favicon-512.png", optimize=True)

        ico_images = [imgs[s] for s in (16, 32, 48)]
        ico_images[0].save(
            out / "favicon.ico",
            format="ICO",
            sizes=[(im.width, im.height) for im in ico_images],
            append_images=ico_images[1:],
        )
        print(f"Wrote favicons to {out}")


if __name__ == "__main__":
    main()

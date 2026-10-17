"""Generate square favicons from the brand oho-logo.png."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "oho-logo.png"
TARGETS = [
    ROOT / "public",
    ROOT.parent / "AdminPannel" / "public",
    ROOT.parent / "VenueVendorPanel" / "public",
]


def make_square(logo: Image.Image, size: int, pad_ratio: float = 0.12) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (20, 20, 20, 255))
    max_w = int(size * (1 - 2 * pad_ratio))
    max_h = int(size * (1 - 2 * pad_ratio))
    lw, lh = logo.size
    scale = min(max_w / lw, max_h / lh)
    nw, nh = max(1, int(lw * scale)), max(1, int(lh * scale))
    resized = logo.resize((nw, nh), Image.Resampling.LANCZOS)
    x = (size - nw) // 2
    y = (size - nh) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def main() -> None:
    logo = Image.open(SRC).convert("RGBA")
    sizes = [16, 32, 48, 180, 192, 512]

    for out in TARGETS:
        out.mkdir(parents=True, exist_ok=True)
        imgs = {s: make_square(logo, s) for s in sizes}

        imgs[32].save(out / "favicon-32.png", optimize=True)
        imgs[48].save(out / "favicon-48.png", optimize=True)
        imgs[180].save(out / "apple-touch-icon.png", optimize=True)
        imgs[192].save(out / "favicon-192.png", optimize=True)
        if (out / "favicon-512.png").parent == out:
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

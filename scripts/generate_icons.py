from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1] / "src" / "icons"
SIZE = 128


def lerp(a: int, b: int, t: float) -> int:
    return round(a + (b - a) * t)


def draw_background() -> Image.Image:
    image = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mask = Image.new("L", (SIZE, SIZE), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle((10, 10, 118, 118), radius=28, fill=255)

    start = (21, 94, 117)
    end = (15, 23, 42)
    x1, y1 = 18, 12
    x2, y2 = 110, 116
    dx = x2 - x1
    dy = y2 - y1
    denom = dx * dx + dy * dy

    for y in range(SIZE):
        for x in range(SIZE):
            if mask.getpixel((x, y)) == 0:
                continue
            t = ((x - x1) * dx + (y - y1) * dy) / denom
            t = max(0.0, min(1.0, t))
            image.putpixel(
                (x, y),
                (
                    lerp(start[0], end[0], t),
                    lerp(start[1], end[1], t),
                    lerp(start[2], end[2], t),
                    255,
                ),
            )

    overlay = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.polygon(
        [
            (22, 34),
            (26, 20),
            (38, 10),
            (84, 10),
            (100, 10),
            (112, 20),
            (116, 34),
            (118, 42),
            (118, 28),
            (99, 10),
            (29, 10),
            (10, 28),
            (10, 42),
            (12, 34),
        ],
        fill=(255, 255, 255, 20),
    )
    return Image.alpha_composite(image, overlay)


def draw_tray(base: Image.Image) -> Image.Image:
    tray = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    tray_draw = ImageDraw.Draw(tray)
    for y in range(81, 100):
        t = (y - 81) / 18
        color = (
            lerp(248, 203, t),
            lerp(250, 213, t),
            lerp(252, 225, t),
            255,
        )
        tray_draw.rounded_rectangle((27, y, 101, y + 1), radius=9, fill=color)

    tray_draw.rounded_rectangle((32, 84, 96, 94), radius=3, fill=(100, 116, 139, 72))
    return Image.alpha_composite(base, tray)


def draw_arrow(base: Image.Image) -> Image.Image:
    arrow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    arrow_draw = ImageDraw.Draw(arrow)
    arrow_points = [
        (57, 35),
        (57, 62),
        (47, 53),
        (44, 51),
        (39, 51),
        (36, 54),
        (36, 59),
        (39, 63),
        (59, 83),
        (64, 86),
        (69, 83),
        (89, 63),
        (92, 59),
        (92, 54),
        (89, 51),
        (84, 51),
        (81, 53),
        (71, 62),
        (71, 35),
        (69, 30),
        (64, 28),
        (59, 30),
    ]
    arrow_draw.polygon(arrow_points, fill=(34, 211, 238, 255))

    for y in range(28, 87):
        for x in range(SIZE):
            r, g, b, a = arrow.getpixel((x, y))
            if a == 0:
                continue
            t = (y - 28) / 58
            arrow.putpixel(
                (x, y),
                (
                    lerp(103, 34, t),
                    lerp(232, 211, t),
                    lerp(249, 238, t),
                    a,
                ),
            )

    return Image.alpha_composite(base, arrow)


def draw_glow(base: Image.Image) -> Image.Image:
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse((83, 29, 99, 45), fill=(255, 255, 255, 31))
    return Image.alpha_composite(base, glow)


def build_icon() -> Image.Image:
    image = draw_background()
    image = draw_tray(image)
    image = draw_arrow(image)
    image = draw_glow(image)
    return image


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    image = build_icon()
    image.save(ROOT / "icon128.png")
    image.resize((48, 48), Image.Resampling.LANCZOS).save(ROOT / "icon48.png")
    image.resize((16, 16), Image.Resampling.LANCZOS).save(ROOT / "icon16.png")


if __name__ == "__main__":
    main()

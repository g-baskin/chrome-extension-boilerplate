from PIL import Image, ImageDraw
from math import cos, sin, pi

def create_icon(size: int, filename: str):
    img = Image.new("RGBA", (size, size), (34, 197, 94, 255))
    draw = ImageDraw.Draw(img)

    # draw field texture (diagonal stripes)
    for y in range(-size, size, 8):
        draw.line((y, 0, y + size, size), fill=(22, 163, 74, 120), width=4)

    # sun
    center = (size * 0.75, size * 0.35)
    radius = size * 0.18
    draw.ellipse(
        [
            (center[0] - radius, center[1] - radius),
            (center[0] + radius, center[1] + radius),
        ],
        fill=(250, 204, 21, 255),
        outline=(245, 158, 11, 255),
        width=max(1, size // 36),
    )

    for angle in range(0, 360, 30):
        rad = angle * 3.14159 / 180
        inner = (
            center[0] + (radius + 1) * cos(rad),
            center[1] + (radius + 1) * sin(rad),
        )
        outer = (
            center[0] + (radius + size * 0.08) * cos(rad),
            center[1] + (radius + size * 0.08) * sin(rad),
        )
        draw.line((*inner, *outer), fill=(251, 191, 36, 230), width=max(1, size // 48))

    img.save(filename, optimize=True)

sizes = [16, 32, 48, 128]
for size in sizes:
    create_icon(size, f"public/icons/icon-{size}.png")

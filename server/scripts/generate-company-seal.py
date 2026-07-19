"""Generate provisional company-seal.png (white bg + red 角印) for invoice PDF.

Note: Production uses the official seal image at public/assets/company-seal.png.
Do not overwrite that file unless intentionally regenerating a placeholder.
"""
from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFont

SIZE = 512
RED = (196, 30, 58)
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "company-seal.png")

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msgothic.ttc",
    r"C:\Windows\Fonts\meiryo.ttc",
    r"C:\Windows\Fonts\YuGothB.ttc",
    r"C:\Windows\Fonts\yugothic.ttf",
]


def load_font(sz: int) -> ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if not os.path.exists(path):
            continue
        try:
            return ImageFont.truetype(path, sz, index=0)
        except Exception:
            try:
                return ImageFont.truetype(path, sz)
            except Exception:
                continue
    return ImageFont.load_default()


def main() -> None:
    img = Image.new("RGB", (SIZE, SIZE), "white")
    draw = ImageDraw.Draw(img)
    margin = 18
    draw.rectangle([margin, margin, SIZE - margin - 1, SIZE - margin - 1], outline=RED, width=14)
    draw.rectangle(
        [margin + 28, margin + 28, SIZE - margin - 29, SIZE - margin - 29],
        outline=RED,
        width=5,
    )

    font = load_font(110)
    chars = ["株", "式", "会", "社"]
    positions = [
        (SIZE * 0.28, SIZE * 0.30),
        (SIZE * 0.72, SIZE * 0.30),
        (SIZE * 0.28, SIZE * 0.58),
        (SIZE * 0.72, SIZE * 0.58),
    ]
    for ch, (cx, cy) in zip(chars, positions):
        bbox = draw.textbbox((0, 0), ch, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((cx - tw / 2, cy - th / 2 - 8), ch, fill=RED, font=font)

    font_s = load_font(48)
    label = "TOMS"
    bbox = draw.textbbox((0, 0), label, font=font_s)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(((SIZE - tw) / 2, SIZE * 0.78 - th / 2), label, fill=RED, font=font_s)

    out = os.path.normpath(OUT)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, "PNG")
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")


if __name__ == "__main__":
    main()

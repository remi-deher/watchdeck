"""
Générateur d'icônes PWA haute résolution pour Watchdeck.
Produit les icônes PNG requises par les spécifications PWA (Android, iOS, Desktop).
"""

import math
import os

from PIL import Image, ImageDraw, ImageFilter


def draw_watchdeck_master(size: int = 1024, is_maskable: bool = False) -> Image.Image:
    """Génère le master Watchdeck haute fidélité."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    bg_dark = (9, 9, 11, 255)  # #09090b
    teal_primary = (8, 145, 178, 255)  # #0891b2
    teal_bright = (103, 232, 249, 255)  # #67e8f9

    if is_maskable:
        draw.rectangle([0, 0, size, size], fill=bg_dark)
        scale = 0.65
    else:
        radius = int(size * 0.22)
        draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=bg_dark)
        scale = 0.82

    center_x, center_y = size / 2, size / 2

    # Lueur d'ambiance cyan au centre (un seul disque flou, composite une fois
    # pour éviter l'effet de superposition qui sature vers du blanc plein).
    glow_size = int(size * 0.45)
    glow_mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(glow_mask).ellipse(
        [center_x - glow_size, center_y - glow_size, center_x + glow_size, center_y + glow_size],
        fill=90,
    )
    glow_mask = glow_mask.filter(ImageFilter.GaussianBlur(glow_size / 2))
    glow_layer = Image.new("RGBA", (size, size), (34, 211, 238, 0))
    glow_layer.putalpha(glow_mask)
    img = Image.alpha_composite(img, glow_layer)
    draw = ImageDraw.Draw(img)

    # Anneau stylisé radar / scan
    ring_radius = int(size * scale * 0.43)
    ring_width = max(4, int(size * 0.04))
    draw.arc(
        [center_x - ring_radius, center_y - ring_radius, center_x + ring_radius, center_y + ring_radius],
        start=35,
        end=325,
        fill=teal_primary,
        width=ring_width,
    )

    # Point lumineux sur l'arc (signal)
    dot_radius = int(ring_width * 1.35)
    dot_angle = math.radians(35)
    dot_x = center_x + ring_radius * math.cos(dot_angle)
    dot_y = center_y + ring_radius * math.sin(dot_angle)
    draw.ellipse([dot_x - dot_radius, dot_y - dot_radius, dot_x + dot_radius, dot_y + dot_radius], fill=teal_bright)

    # Dessin vectoriel du 'W' stylisé Watchdeck
    w_height = int(size * scale * 0.52)
    w_width = int(w_height * 0.95)
    stroke_width = max(6, int(w_width * 0.18))

    top_y = center_y - w_height * 0.5
    bot_y = center_y + w_height * 0.5
    left_x = center_x - w_width * 0.5
    right_x = center_x + w_width * 0.5
    mid_x = center_x
    mid_y = top_y + w_height * 0.42

    points = [
        (left_x, top_y),
        (left_x + w_width * 0.25, bot_y),
        (mid_x, mid_y),
        (left_x + w_width * 0.75, bot_y),
        (right_x, top_y),
    ]
    draw.line(points, fill=teal_bright, width=stroke_width, joint="curve")
    cap_radius = stroke_width / 2
    for px, py in points:
        draw.ellipse([px - cap_radius, py - cap_radius, px + cap_radius, py + cap_radius], fill=teal_bright)

    return img


def main():
    out_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "public")
    os.makedirs(out_dir, exist_ok=True)

    master_standard = draw_watchdeck_master(1024, is_maskable=False)
    master_maskable = draw_watchdeck_master(1024, is_maskable=True)

    # 1. Icônes standard
    sizes = [
        ("icon-512.png", 512, master_standard),
        ("icon-192.png", 192, master_standard),
        ("apple-touch-icon.png", 180, master_standard),
        ("favicon.png", 64, master_standard),
        ("favicon-32.png", 32, master_standard),
        ("favicon-16.png", 16, master_standard),
        ("icon-maskable-512.png", 512, master_maskable),
        ("icon-maskable-192.png", 192, master_maskable),
    ]

    for filename, size, master in sizes:
        path = os.path.join(out_dir, filename)
        resized = master.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(path, "PNG", optimize=True)
        print(f"Generated: {filename} ({size}x{size})")

    # 2. Favicon.ico multi-tailles
    fav_path = os.path.join(out_dir, "favicon.ico")
    icon16 = master_standard.resize((16, 16), Image.Resampling.LANCZOS)
    icon16.save(fav_path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print("Generated: favicon.ico (16, 32, 48)")


if __name__ == "__main__":
    main()

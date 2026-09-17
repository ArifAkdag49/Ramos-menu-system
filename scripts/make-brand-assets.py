# -*- coding: utf-8 -*-
"""Ramo's marka varlıkları: menü PDF'inin kapağındaki altın alevden PWA / Android ikonları.

Renkler değiştirilmez; alev yalnız kırpılır, zeminden ayrılır ve ölçeklenir (Görev 25 Adım 1).
Kullanım (depo kökünden):  python scripts/make-brand-assets.py
Gerekenler: PyMuPDF (pymupdf), Pillow.
"""
from pathlib import Path

import pymupdf
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "docs" / "menu" / "source" / "ramos-menu.pdf"
# `/icons/` değil: Apache'nin varsayılan `Alias /icons/` kuralı Plesk'te o yolu yutar (404).
OUT_ICONS = ROOT / "apps" / "web" / "public" / "app-icons"
OUT_BRAND = ROOT / "apps" / "web" / "public" / "brand"
BG = (10, 10, 10)  # --color-bg #0A0A0A

# Kapaktaki alevin kutusu (PDF noktası, 612 × 859 sayfa). 600 dpi'de ~625 × 750 px.
FLAME_CLIP = pymupdf.Rect(270, 470, 345, 560)


def extract_flame() -> Image.Image:
    page = pymupdf.open(PDF)[0]
    pix = page.get_pixmap(dpi=600, clip=FLAME_CLIP)
    rgb = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

    # Zemin dokulu siyah, alev altın: altın pikselde kırmızı yüksek ve maviden belirgin fazla.
    # Yumuşak kenar için eşiğin etrafında doğrusal geçiş, sonra hafif bulanık alfa.
    alpha = Image.new("L", rgb.size)
    px, ap = rgb.load(), alpha.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = px[x, y]
            score = min(r - 60, (r - b) - 25)
            ap[x, y] = max(0, min(255, int(score * 6)))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.6))
    flame = rgb.convert("RGBA")
    flame.putalpha(alpha)
    return flame.crop(alpha.getbbox())


def place(flame: Image.Image, size: int, scale: float, bg=BG) -> Image.Image:
    """Alevi `size` karenin ortasına, yüksekliği `scale` oranında yerleştirir."""
    canvas = Image.new("RGBA", (size, size), bg + (255,) if bg else (0, 0, 0, 0))
    h = round(size * scale)
    w = round(flame.width * h / flame.height)
    resized = flame.resize((w, h), Image.LANCZOS)
    canvas.alpha_composite(resized, ((size - w) // 2, (size - h) // 2))
    return canvas


def main() -> None:
    OUT_ICONS.mkdir(parents=True, exist_ok=True)
    OUT_BRAND.mkdir(parents=True, exist_ok=True)
    flame = extract_flame()
    flame.save(OUT_BRAND / "flame.png", optimize=True)

    place(flame, 192, 0.62).save(OUT_ICONS / "icon-192.png", optimize=True)
    place(flame, 512, 0.62).save(OUT_ICONS / "icon-512.png", optimize=True)
    # Maskable: güvenli bölge merkezdeki %80'lik daire → alev %50.
    place(flame, 512, 0.50).save(OUT_ICONS / "maskable-512.png", optimize=True)
    place(flame, 180, 0.62).convert("RGB").save(OUT_ICONS / "apple-touch-icon.png", optimize=True)
    place(flame, 48, 0.78).save(OUT_ICONS / "favicon.png", optimize=True)

    # Bildirim rozeti (Android durum çubuğu): beyaz siluet, saydam zemin.
    badge = place(flame, 72, 0.80, bg=None)
    white = Image.new("RGBA", badge.size, (255, 255, 255, 0))
    white.putalpha(badge.getchannel("A"))
    white.save(OUT_ICONS / "badge-72.png", optimize=True)
    print("tamam:", sorted(p.name for p in OUT_ICONS.iterdir()))


if __name__ == "__main__":
    main()

"""Ramo's Android ikonlarını ve açılış görsellerini apps/web/public/app-icons'tan üretir.

Android Studio gerektirmez (yalnız Pillow). Çalıştır:  python apps/mobile/scripts/gen-icons.py
- mipmap-*/ic_launcher.png, ic_launcher_round.png  : eski (API < 26) başlatıcı ikonları (icon-512)
- mipmap-*/ic_launcher_foreground.png              : uyarlanabilir ikon ön planı, 108dp (maskable-512)
- drawable-*/ic_stat_ramos.png                     : bildirim küçük ikonu, 24dp beyaz siluet (badge-72)
- drawable*/splash.png                             : koyu (#0A0A0A) zemin + ortada alev (icon-512)
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'apps/web/public/app-icons'
RES = ROOT / 'apps/mobile/android/app/src/main/res'
BG = (10, 10, 10, 255)
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

icon = Image.open(SRC / 'icon-512.png').convert('RGBA')
maskable = Image.open(SRC / 'maskable-512.png').convert('RGBA')
badge = Image.open(SRC / 'badge-72.png').convert('RGBA')


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)


for d, f in DENS.items():
    s = round(48 * f)
    save(icon.resize((s, s), Image.LANCZOS), RES / f'mipmap-{d}/ic_launcher.png')
    # Yuvarlak: 4× boyutta daire maskesi (kenar yumuşatma), sonra küçült.
    big = icon.resize((s * 4, s * 4), Image.LANCZOS)
    mask = Image.new('L', big.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big.size[0] - 1, big.size[1] - 1), fill=255)
    round_ = Image.new('RGBA', big.size, (0, 0, 0, 0))
    round_.paste(big, (0, 0), mask)
    save(round_.resize((s, s), Image.LANCZOS), RES / f'mipmap-{d}/ic_launcher_round.png')
    fg = round(108 * f)
    save(maskable.resize((fg, fg), Image.LANCZOS), RES / f'mipmap-{d}/ic_launcher_foreground.png')

    # Bildirim ikonu: Android yalnız alfa kanalını kullanır → saf beyaz + kaynağın alfası.
    st = round(24 * f)
    a = badge.resize((st, st), Image.LANCZOS).getchannel('A')
    white = Image.new('RGBA', (st, st), (255, 255, 255, 0))
    white.putalpha(a)
    save(white, RES / f'drawable-{d}/ic_stat_ramos.png')


def splash(w: int, h: int) -> Image.Image:
    img = Image.new('RGBA', (w, h), BG)
    side = round(min(w, h) * 0.45)
    im = icon.resize((side, side), Image.LANCZOS)
    img.paste(im, ((w - side) // 2, (h - side) // 2), im)
    return img.convert('RGB')


# Capacitor şablonunun splash.png dosyalarını aynı boyutlarda koyu sürümle değiştir.
for p in RES.glob('drawable*/splash.png'):
    with Image.open(p) as old:
        w, h = old.size
    save(splash(w, h), p)
print('ikonlar üretildi:', RES)

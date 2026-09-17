import QRCode from 'qrcode';

export const QR_FILE_NAME = 'ramos-qr-menu-10cm.svg';

export const menuUrl = (origin: string) => `${origin}/menu`;

/**
 * Masaya konacak QR kodu: gerçek vektör SVG, baskıda tam 10 × 10 cm. `viewBox` modül ızgarasını
 * taşır, kök `<svg>`'deki `width/height="100mm"` fiziksel ölçüyü verir — yazdırma programı
 * ölçeklemeden basarsa kod 10 cm çıkar. Kenarda 4 modül sessiz alan (standart), hata düzeltme M
 * (masada hafif çizik/leke tolere edilir, kod gereksiz yoğunlaşmaz).
 */
export async function qrSvg10cm(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 4,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
  return svg.replace(/<svg\b[^>]*>/, (tag) => {
    const clean = tag.replace(/\s(width|height)="[^"]*"/g, '');
    return clean.replace(/^<svg/, '<svg width="100mm" height="100mm"');
  });
}

/** Tarayıcıda SVG dosyası olarak indirir. */
export function downloadSvg(svg: string, fileName = QR_FILE_NAME) {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Önizleme için güvenli kaynak: kendi ürettiğimiz SVG, `<img>` içinde (betik çalışmaz). */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

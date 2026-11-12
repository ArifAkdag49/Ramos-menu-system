import QRCode from 'qrcode';

export const TIMECLOCK_QR_FILE = 'ramos-mesai-qr.svg';

/** Mesai QR'ı: vektör SVG, baskıda 10 × 10 cm; duvarda uzaktan ve eğik açıdan okunsun diye hata düzeltme Q. */
export async function timeclockQrSvg(url: string): Promise<string> {
  const svg = await QRCode.toString(url, {
    type: 'svg',
    margin: 4,
    errorCorrectionLevel: 'Q',
    color: { dark: '#000000', light: '#ffffff' },
  });
  return svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag.replace(/\s(width|height)="[^"]*"/g, '').replace(/^<svg/, '<svg width="100mm" height="100mm"'),
  );
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Duvara asılacak A4 sayfası: başlık, 10 cm QR, kısa talimat. Yeni pencerede açılıp yazdırma penceresi
 * çağrılır; SVG kendi ürettiğimiz içeriktir, metinler kaçışlanır.
 */
export function printTimeclockQr(svg: string, text: { brand: string; title: string; hint: string }): boolean {
  const w = window.open('', '_blank', 'width=700,height=900');
  if (!w) return false;
  w.document.title = text.title;
  w.document.body.style.cssText = 'margin:0;font-family:sans-serif;text-align:center;padding-top:48px;color:#000';
  w.document.body.innerHTML = `<h1 style="font-size:34px;margin:0 0 8px">${escapeHtml(text.brand)}</h1>
    <p style="font-size:24px;margin:0 0 32px">${escapeHtml(text.title)}</p>
    <div>${svg}</div>
    <p style="font-size:20px;margin-top:32px">${escapeHtml(text.hint)}</p>`;
  w.focus();
  w.print();
  return true;
}

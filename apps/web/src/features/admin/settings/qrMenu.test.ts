import { describe, expect, it } from 'vitest';
import { menuUrl, QR_FILE_NAME, qrSvg10cm } from './qrMenu';

describe('qrSvg10cm', () => {
  it('kök <svg> baskıda tam 100 × 100 mm, vektör (viewBox + path)', async () => {
    const svg = await qrSvg10cm('https://ramos.example/menu');
    const root = /<svg[^>]*>/.exec(svg)?.[0] ?? '';
    expect(root).toContain('width="100mm"');
    expect(root).toContain('height="100mm"');
    expect(root).toMatch(/viewBox="0 0 \d+ \d+"/);
    expect(svg).toContain('<path');
    expect(svg).not.toContain('<image');
    // Tek bir ölçü çifti: eski width/height kalmamalı.
    expect(root.match(/\swidth=/g)).toHaveLength(1);
    expect(root.match(/\sheight=/g)).toHaveLength(1);
  });

  it('farklı adres farklı kod', async () => {
    const a = await qrSvg10cm('https://ramos.example/menu');
    const b = await qrSvg10cm('https://other.example/menu');
    expect(a).not.toBe(b);
  });

  it('bağlantı ve dosya adı', () => {
    expect(menuUrl('https://ramos.example')).toBe('https://ramos.example/menu');
    expect(QR_FILE_NAME).toBe('ramos-qr-menu-10cm.svg');
  });
});

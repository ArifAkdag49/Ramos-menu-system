import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import { QrMenuSection } from './QrMenuSection';

afterEach(() => vi.restoreAllMocks());

describe('<QrMenuSection />', () => {
  it('bağlantı, menüyü aç, QR önizlemesi (img, data: SVG)', async () => {
    render(<QrMenuSection origin="https://ramos.example" />);
    expect(screen.getByRole('heading', { name: 'QR menü', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('https://ramos.example/menu')).toBeInTheDocument();
    const open = screen.getByRole('link', { name: 'Menüyü aç' });
    expect(open).toHaveAttribute('href', 'https://ramos.example/menu');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open).toHaveAttribute('rel', expect.stringContaining('noopener'));

    const img = await screen.findByRole('img', { name: 'Menü bağlantısının QR kodu' });
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml;utf8,/);
    expect(decodeURIComponent(img.getAttribute('src') ?? '')).toContain('width="100mm"');
  });

  it('SVG indir: 10 cm dosyası adıyla indirilir', async () => {
    const created: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
      created.push(b as Blob);
      return 'blob:qr';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('ramos-qr-menu-10cm.svg');
      expect(this.href).toBe('blob:qr');
    });

    render(<QrMenuSection origin="https://ramos.example" />);
    await screen.findByRole('img', { name: 'Menü bağlantısının QR kodu' });
    await userEvent.click(screen.getByRole('button', { name: 'SVG indir (10 × 10 cm)' }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(created[0]?.type).toBe('image/svg+xml');
    expect(await created[0]?.text()).toContain('height="100mm"');
  });
});

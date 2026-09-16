/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useOverlay } from '../lib/overlay';
import { useToast } from '../lib/toast';
import { Sheet } from './Sheet';
import { ToastHost } from './ToastHost';

/**
 * R73: toast kabı `z-60`, `Sheet` `z-50` — alt konumda kalırsa panelin **ana eylemini** örter
 * ("Mutfağa gönder", "Onayla ve gönder") ve en kötüsü masa kapatma engelinin "ne yapmalı"
 * satırını yarım bırakır. Panel açıkken toast üste taşınır, panel kapanınca alta döner.
 *
 * R81: üst konum bu kez sayfa başlığını örtmemeli — başlığın **altından** başlar ve baloncuk
 * arkasında ne olursa olsun okunur kalsın diye opak bir yüzeye oturur.
 */
function Screen({ sheetOpen }: { sheetOpen: boolean }) {
  return (
    <>
      <Sheet open={sheetOpen} onClose={() => {}} title="Sepet" closeLabel="Kapat">
        <button type="button">Mutfağa gönder</button>
      </Sheet>
      <ToastHost />
    </>
  );
}

const host = () => screen.getByRole('status');
const bubble = () => screen.getByTestId('toast-bubble');

describe('ToastHost konumu (R73)', () => {
  it('panel yokken toast altta durur', () => {
    useToast.getState().show('Masa kapatıldı');
    render(<Screen sheetOpen={false} />);
    expect(host()).toHaveAttribute('data-position', 'bottom');
  });

  it('panel açıkken toast üste taşınır — ana eylem okunur kalır', () => {
    useToast.getState().show('Mutfağa gönderildi · #047');
    render(<Screen sheetOpen />);
    expect(host()).toHaveAttribute('data-position', 'top');
  });

  it('panel kapanınca toast alta döner', () => {
    useToast.getState().show('Mutfağa gönderildi · #047');
    const { rerender } = render(<Screen sheetOpen />);
    expect(host()).toHaveAttribute('data-position', 'top');
    rerender(<Screen sheetOpen={false} />);
    expect(host()).toHaveAttribute('data-position', 'bottom');
  });

  /**
   * İç içe panel gerçek bir akış: sepet açıkken ürün panelini açmak. Sayaç yalnız ikisi de
   * kapanınca sıfırlanmalı, yoksa üstteki panel kapanır kapanmaz toast alta düşüp alttaki
   * panelin ana eylemini yeniden örterdi.
   */
  it('iç içe panellerde sayaç ters sırada kapanışta doğru çözülür', () => {
    useToast.getState().show('Mutfağa gönderildi · #047');
    const outer = render(
      <Sheet open onClose={() => {}} title="Sepet" closeLabel="Kapat">
        <button type="button">Mutfağa gönder</button>
      </Sheet>,
    );
    const inner = render(
      <Sheet open onClose={() => {}} title="Ürün" closeLabel="Kapat">
        <button type="button">Sepete ekle</button>
      </Sheet>,
    );
    render(<ToastHost />);
    expect(useOverlay.getState().openSheets).toBe(2);
    expect(host()).toHaveAttribute('data-position', 'top');

    inner.unmount();
    expect(useOverlay.getState().openSheets).toBe(1);
    expect(host()).toHaveAttribute('data-position', 'top');

    outer.unmount();
    expect(useOverlay.getState().openSheets).toBe(0);
    expect(host()).toHaveAttribute('data-position', 'bottom');
  });
});

/**
 * R81: bir önceki turda toast panelin ana eylemini kurtardı ama bu kez `sticky top-0` sayfa
 * başlığının üstüne bindi; %15 opak ton zemini başlık metniyle iç içe geçip okunaksız oldu.
 */
describe('ToastHost üst konumu sayfa başlığını örtmez (R81)', () => {
  const source = (path: string) => readFileSync(path, 'utf8');

  it('başlık yüksekliği tek kaynaktan gelir: tokens.css', () => {
    expect(source('src/styles/tokens.css')).toMatch(/--header-h:\s*[^;]+;/);
  });

  it('yapışkan başlıkların HEPSİ aynı değişkeni kullanır — ikinci bir sabit yok', () => {
    // KDS de dahil: mutfakta bir panel (tükendi çekmecesi, kart "⋯" paneli) açıkken hata toast'ı
    // üst konuma geçiyor. KDS başlığı kendi yüksekliğini ayrı yazarsa toast ya başlığın üstüne
    // biner ya da altında boşluk bırakır — bugün 80 px ile 80 px RASTLANTISAL olarak denk düşüyordu.
    expect(source('src/features/waiter/WaiterLayout.tsx')).toContain('h-[var(--header-h)]');
    expect(source('src/features/waiter/OrderPage.tsx')).toContain('h-[var(--header-h)]');
    expect(source('src/features/kitchen/KitchenHeader.tsx')).toContain('h-[var(--header-h)]');
  });

  it('üst konum başlık yüksekliği kadar ofsetlidir', () => {
    useToast.getState().show('Mutfağa gönderildi · #047');
    render(<Screen sheetOpen />);
    expect(host().className).toContain('var(--header-h)');
  });

  it('baloncuk opak bir yüzeye oturur — arkasındaki başlık metni karışmaz', () => {
    useToast.getState().show('Mutfağa gönderildi · #047');
    render(<Screen sheetOpen />);
    expect(bubble().className).toContain('bg-surface-2');
    expect(bubble().className).not.toMatch(/bg-[a-z0-9-]+\/\d+/);
  });
});

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

  it('sayaç eksiye düşmez (iç içe kapanışlarda konum kilitlenmesin)', () => {
    useOverlay.getState().pop();
    useOverlay.getState().pop();
    expect(useOverlay.getState().openSheets).toBe(0);
  });
});

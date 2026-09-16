import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';

function open(onClose = vi.fn()) {
  render(
    <Sheet open onClose={onClose} title="Ürün seçenekleri" closeLabel="Kapat">
      <button type="button">Sepete ekle</button>
    </Sheet>,
  );
  return onClose;
}

describe('Sheet', () => {
  it('kapalıyken hiçbir şey çizmez', () => {
    render(
      <Sheet open={false} onClose={vi.fn()} title="Ürün seçenekleri" closeLabel="Kapat">
        <p>içerik</p>
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('başlık ve içerikle açılır', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Ürün seçenekleri' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sepete ekle' })).toBeInTheDocument();
  });

  it('M4: erişilebilirlik ağacında "Kapat" adlı tek bir düğme olur', () => {
    open();
    expect(screen.getAllByRole('button', { name: 'Kapat' })).toHaveLength(1);
  });

  it('Esc ile kapanır', async () => {
    const onClose = open();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('M4: açıkken arka plan kaydırması kilitlenir, kapanınca geri açılır', () => {
    const { unmount } = render(
      <Sheet open onClose={vi.fn()} title="Ürün seçenekleri" closeLabel="Kapat">
        <p>içerik</p>
      </Sheet>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});

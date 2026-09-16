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

  /**
   * Görev 11 inceleme bulgusu: `onClose` çoğu çağrı yerinde satır içi bir kapanış — her
   * ebeveyn render'ında yeni bir referans. Efekt `[open, onClose]`'a bağlıysa her render'da
   * yeniden çalışır: `inert` yeniden uygulanır ve odak ilk elemana geri çalınır — telefonda
   * garson bir şeye dokunurken klavye zıplar ya da seçim kaybolur.
   */
  it('Görev 13: ebeveyn yeniden render olduğunda (kararsız onClose) inert tekrar uygulanmaz ve odak çalınmaz', () => {
    const appRoot = document.createElement('div');
    appRoot.id = 'root';
    document.body.appendChild(appRoot);
    const setAttributeSpy = vi.spyOn(Element.prototype, 'setAttribute');

    try {
      const { rerender } = render(
        <Sheet open onClose={() => {}} title="Ürün seçenekleri" closeLabel="Kapat">
          <button type="button">Birinci</button>
          <button type="button">İkinci</button>
        </Sheet>,
      );
      const second = screen.getByRole('button', { name: 'İkinci' });
      second.focus();
      expect(document.activeElement).toBe(second);

      const inertCalls = () =>
        setAttributeSpy.mock.calls.filter(
          (args, i) => args[0] === 'inert' && setAttributeSpy.mock.instances[i] === appRoot,
        ).length;
      const before = inertCalls();

      // Ebeveynin satır içi `onClose`'u her render'da yeni bir fonksiyon referansı verir.
      rerender(
        <Sheet open onClose={() => {}} title="Ürün seçenekleri" closeLabel="Kapat">
          <button type="button">Birinci</button>
          <button type="button">İkinci</button>
        </Sheet>,
      );

      expect(inertCalls()).toBe(before);
      expect(document.activeElement).toBe(second);
    } finally {
      setAttributeSpy.mockRestore();
      appRoot.remove();
    }
  });
});

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOverlay } from '../lib/overlay';
import { Sheet } from '../ui/Sheet';
import { BACK_HANDLER_NAME, setupBackButton } from './backButton';

type W = Window & { __ramosBack?: () => boolean };

afterEach(() => {
  delete (window as W)[BACK_HANDLER_NAME];
  useOverlay.setState({ openSheets: 0, closers: [] });
});

describe('setupBackButton (Android geri tuşu)', () => {
  it('genel fonksiyonu tanımlar; açık panel yoksa false (yerel taraf geçmişte geri gider)', () => {
    setupBackButton();
    expect(typeof (window as W).__ramosBack).toBe('function');
    expect((window as W).__ramosBack!()).toBe(false);
  });

  it('açık panel varsa en üsttekini kapatır ve true döner; sonra sıradaki', () => {
    setupBackButton();
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} title="Panel" closeLabel="Kapat">
        <p>içerik</p>
      </Sheet>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect((window as W).__ramosBack!()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('panel meşgulken kapatmaz ama yine true döner (Esc gibi kilitli — sayfa geri gitmez)', () => {
    setupBackButton();
    const onClose = vi.fn();
    render(
      <Sheet open busy onClose={onClose} title="Gönderiliyor" closeLabel="Kapat">
        <p>içerik</p>
      </Sheet>,
    );
    expect((window as W).__ramosBack!()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('iki panel üst üste: önce en son açılan kapanır', () => {
    setupBackButton();
    const first = vi.fn();
    const second = vi.fn();
    useOverlay.getState().push(first);
    useOverlay.getState().push(second);
    expect((window as W).__ramosBack!()).toBe(true);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    useOverlay.getState().pop(second);
    expect((window as W).__ramosBack!()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('kapatıcı fırlatsa bile false döner — yerel taraf kilitlenmez', () => {
    setupBackButton(window, () => {
      throw new Error('bozuk');
    });
    expect((window as W).__ramosBack!()).toBe(false);
  });

  it('kapanan panelin kapatıcısı listeden düşer, sayaç sıfırlanır', () => {
    const { unmount } = render(
      <Sheet open onClose={vi.fn()} title="Panel" closeLabel="Kapat">
        <p>içerik</p>
      </Sheet>,
    );
    expect(useOverlay.getState().closers).toHaveLength(1);
    expect(useOverlay.getState().openSheets).toBe(1);
    unmount();
    expect(useOverlay.getState().closers).toHaveLength(0);
    expect(useOverlay.getState().openSheets).toBe(0);
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import type { Platform } from '../../pwa/platform';

const platform: Platform = { isIOS: false, isAndroid: true, standalone: false, twa: false };
vi.mock('../../pwa/platform', () => ({ detectPlatform: () => platform }));

const push = { pushState: vi.fn(), enablePush: vi.fn(), disablePush: vi.fn() };
vi.mock('../../pwa/push', () => ({
  pushState: () => push.pushState(),
  enablePush: () => push.enablePush(),
  disablePush: () => push.disablePush(),
}));

import { useToast } from '../../lib/toast';
import { usePush } from '../../pwa/pushStore';
import { NotificationsSection } from './NotificationsSection';

beforeEach(() => {
  Object.assign(platform, { isIOS: false, isAndroid: true, standalone: false, twa: false });
  push.pushState.mockReset().mockResolvedValue('disabled');
  push.enablePush.mockReset().mockResolvedValue({ ok: true });
  push.disablePush.mockReset().mockResolvedValue(undefined);
  usePush.setState({ state: 'loading', busy: false });
  useToast.setState({ message: null });
});

describe('<NotificationsSection />', () => {
  it('kapalıyken durumu ve "Bildirimleri aç" düğmesini gösterir; açınca durum güncellenir', async () => {
    push.pushState.mockResolvedValueOnce('disabled').mockResolvedValue('enabled');
    render(<NotificationsSection />);

    expect(await screen.findByText(/^Kapalı/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimleri aç' }));

    expect(push.enablePush).toHaveBeenCalledOnce();
    expect(await screen.findByText(/^Açık/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bildirimleri kapat' })).toBeInTheDocument();
    expect(useToast.getState().message).toBe('Bildirimler açıldı');
  });

  it('açıkken kapatılabilir', async () => {
    push.pushState.mockResolvedValueOnce('enabled').mockResolvedValue('disabled');
    render(<NotificationsSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Bildirimleri kapat' }));
    expect(push.disablePush).toHaveBeenCalledOnce();
    expect(await screen.findByRole('button', { name: 'Bildirimleri aç' })).toBeInTheDocument();
  });

  it('iPhone Safari sekmesinde ana ekrana ekleme açıklaması', async () => {
    Object.assign(platform, { isIOS: true, isAndroid: false });
    push.pushState.mockResolvedValue('unsupported');
    render(<NotificationsSection />);
    expect(await screen.findByText(/yalnız ana ekrana eklenen uygulamada/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bildirimleri aç' })).not.toBeInTheDocument();
  });

  it('izin reddedildiyse ayarlardan nasıl açılacağını söyler', async () => {
    push.pushState.mockResolvedValue('denied');
    render(<NotificationsSection />);
    expect(await screen.findByText('İzin reddedildi')).toBeInTheDocument();
    expect(screen.getByText(/Telefon ayarlarından/)).toBeInTheDocument();
  });

  it('yerel uygulamada kayıt yapılamazsa (Firebase yok) sakin durum: "bu sürümde kapalı", düğme yok', async () => {
    push.enablePush.mockResolvedValue({
      ok: false,
      reason: 'unavailable',
      detail: 'registration_timeout',
    });
    push.pushState.mockResolvedValueOnce('disabled').mockResolvedValue('error');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<NotificationsSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Bildirimleri aç' }));

    expect(await screen.findByText('Bildirimler bu sürümde kapalı')).toBeInTheDocument();
    expect(screen.getByText(/Bu uygulama sürümü bildirim alamıyor/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bildirimleri aç' })).not.toBeInTheDocument();
    expect(useToast.getState().message).toBe('Bildirimler bu sürümde kapalı');
    expect(useToast.getState().tone).toBe('warning');
  });

  it('izin penceresi reddedilirse uyarı mesajı verir', async () => {
    push.enablePush.mockResolvedValue({ ok: false, reason: 'denied' });
    push.pushState.mockResolvedValueOnce('disabled').mockResolvedValue('denied');
    render(<NotificationsSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Bildirimleri aç' }));
    await screen.findByText('İzin reddedildi');
    expect(useToast.getState().message).toMatch(/İzin reddedildi/);
    expect(useToast.getState().tone).toBe('warning');
  });
});

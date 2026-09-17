import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import type { Platform } from '../../pwa/platform';

const platform: Platform = { isIOS: false, isAndroid: true, standalone: false, twa: false };
vi.mock('../../pwa/platform', () => ({ detectPlatform: () => platform }));

const push = {
  pushState: vi.fn(),
  enablePush: vi.fn(),
  disablePush: vi.fn(),
};
vi.mock('../../pwa/push', () => ({
  pushState: () => push.pushState(),
  enablePush: () => push.enablePush(),
  disablePush: () => push.disablePush(),
}));

import { useInstallPrompt, type BeforeInstallPromptEvent } from '../../pwa/installPrompt';
import { usePush } from '../../pwa/pushStore';
import { InstallGuide } from './InstallGuide';

const setPlatform = (p: Partial<Platform>) => Object.assign(platform, p);

beforeEach(() => {
  setPlatform({ isIOS: false, isAndroid: true, standalone: false, twa: false });
  push.pushState.mockReset().mockResolvedValue('disabled');
  push.enablePush.mockReset().mockResolvedValue({ ok: true });
  usePush.setState({ state: 'loading', busy: false });
  useInstallPrompt.setState({ event: null, installed: false });
  localStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

describe('<InstallGuide />', () => {
  it('iPhone Safari: Paylaş → Ana Ekrana Ekle adımları; bildirim düğmesi yok, önce kurulum istenir', async () => {
    setPlatform({ isIOS: true, isAndroid: false });
    push.pushState.mockResolvedValue('unsupported');
    render(<InstallGuide />);

    expect(await screen.findByText(/Paylaş düğmesine dokun/)).toBeInTheDocument();
    expect(screen.getByText('Listeden “Ana Ekrana Ekle”yi seç')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bildirimleri aç' })).not.toBeInTheDocument();
    expect(screen.getByText(/Önce Ramo's'u ana ekrana ekle/)).toBeInTheDocument();
  });

  it('Android Chrome: beforeinstallprompt varsa "Uygulamayı yükle" düğmesi yükleme penceresini açar', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    useInstallPrompt.setState({
      event: {
        prompt,
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      } as unknown as BeforeInstallPromptEvent,
    });
    render(<InstallGuide />);

    await userEvent.click(await screen.findByRole('button', { name: 'Uygulamayı yükle' }));
    expect(prompt).toHaveBeenCalledOnce();
    expect(await screen.findByText(/Yüklendi/)).toBeInTheDocument();
  });

  it('Android Chrome: yükleme olayı yoksa menü talimatı gösterilir, bildirim yine açılabilir', async () => {
    render(<InstallGuide />);
    expect(await screen.findByText(/Chrome menüsünden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bildirimleri aç' })).toBeInTheDocument();
  });

  it('Android uygulaması (TWA) içinde kurulum adımı atlanır, doğrudan "Bildirimleri aç"', async () => {
    setPlatform({ standalone: true, twa: true });
    render(<InstallGuide />);

    expect(await screen.findByRole('button', { name: 'Bildirimleri aç' })).toBeInTheDocument();
    expect(screen.queryByText(/Chrome menüsünden/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Uygulamayı yükle' })).not.toBeInTheDocument();
  });

  it('yerel Android uygulaması (Capacitor) içinde kurulum adımı atlanır; iOS dalı etkilenmez', async () => {
    (window as Window & { Capacitor?: unknown }).Capacitor = {
      isNativePlatform: () => true,
      Plugins: {},
    };
    try {
      render(<InstallGuide />);
      expect(await screen.findByRole('button', { name: 'Bildirimleri aç' })).toBeInTheDocument();
      expect(screen.queryByText(/Chrome menüsünden/)).not.toBeInTheDocument();
      expect(screen.queryByText('Uygulamayı ana ekrana ekle')).not.toBeInTheDocument();
    } finally {
      delete (window as Window & { Capacitor?: unknown }).Capacitor;
    }
  });

  it('yerel uygulamada bildirim kaydı yapılamadıysa açıklama gösterilir', async () => {
    setPlatform({ standalone: true });
    push.pushState.mockResolvedValue('error');
    render(<InstallGuide />);
    expect(await screen.findByText(/Bu uygulama sürümü bildirim alamıyor/)).toBeInTheDocument();
  });

  it('bildirim açılınca rehber gizlenir ve bir daha gösterilmez', async () => {
    setPlatform({ standalone: true });
    push.pushState.mockResolvedValueOnce('disabled').mockResolvedValue('enabled');
    const { unmount } = render(<InstallGuide />);

    await userEvent.click(await screen.findByRole('button', { name: 'Bildirimleri aç' }));
    expect(push.enablePush).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /uygulamasını kur/ })).not.toBeInTheDocument(),
    );
    unmount();

    push.pushState.mockResolvedValue('disabled');
    render(<InstallGuide />);
    await act(async () => {});
    expect(screen.queryByRole('region', { name: /uygulamasını kur/ })).not.toBeInTheDocument();
  });

  it('kapatılabilir; kapatılınca bir daha gösterilmez', async () => {
    const { unmount } = render(<InstallGuide />);
    await userEvent.click(await screen.findByRole('button', { name: 'Kurulum rehberini kapat' }));
    expect(screen.queryByRole('region', { name: /uygulamasını kur/ })).not.toBeInTheDocument();
    unmount();

    render(<InstallGuide />);
    await act(async () => {});
    expect(screen.queryByRole('region', { name: /uygulamasını kur/ })).not.toBeInTheDocument();
  });

  it('bildirimler zaten açıksa hiç görünmez', async () => {
    push.pushState.mockResolvedValue('enabled');
    render(<InstallGuide />);
    await act(async () => {});
    expect(screen.queryByRole('region', { name: /uygulamasını kur/ })).not.toBeInTheDocument();
  });

  it('izin reddedilmişse ne yapılacağını söyler', async () => {
    setPlatform({ standalone: true });
    push.pushState.mockResolvedValue('denied');
    render(<InstallGuide />);
    expect(await screen.findByText(/Telefon ayarlarından/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bildirimleri aç' })).not.toBeInTheDocument();
  });

  it('depo erişilemezse (özel mod) yine çalışır', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    render(<InstallGuide />);
    await userEvent.click(await screen.findByRole('button', { name: 'Kurulum rehberini kapat' }));
    expect(screen.queryByRole('region', { name: /uygulamasını kur/ })).not.toBeInTheDocument();
  });
});

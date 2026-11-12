import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';

const rpc = vi.hoisted(() => ({ callRpc: vi.fn() }));
vi.mock('../../lib/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/rpc')>()),
  callRpc: rpc.callRpc,
}));

import { RpcError } from '../../lib/rpc';
import { DEVICE_KEY } from './deviceToken';
import { TimeclockPage } from './TimeclockPage';

const TOKEN = 'a'.repeat(64);

const show = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mesai" element={<TimeclockPage />} />
        <Route path="/mesai/bagla/:code" element={<TimeclockPage />} />
        <Route path="/mesai/:qr" element={<TimeclockPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('TimeclockPage', () => {
  beforeAll(() => {
    void i18n.changeLanguage('tr');
  });
  beforeEach(() => {
    rpc.callRpc.mockReset();
    localStorage.clear();
  });

  it('eşleştirme linki anahtarı telefona yazar', async () => {
    rpc.callRpc.mockResolvedValueOnce({ token: TOKEN, name: 'Ayşe' });
    show('/mesai/bagla/kod123');
    expect(await screen.findByText('Telefonunuz eşleşti')).toBeInTheDocument();
    expect(screen.getByText('Merhaba, Ayşe')).toBeInTheDocument();
    expect(rpc.callRpc).toHaveBeenCalledWith('timeclock_pair', { p_code: 'kod123' });
    expect(localStorage.getItem(DEVICE_KEY)).toBe(TOKEN);
  });

  it('kullanılmış link söylenir', async () => {
    rpc.callRpc.mockRejectedValueOnce(new RpcError('timeclock_bad_pair'));
    show('/mesai/bagla/eski');
    expect(await screen.findByText('Bu link geçersiz')).toBeInTheDocument();
    expect(localStorage.getItem(DEVICE_KEY)).toBeNull();
  });

  it('eşleşmemiş telefon sunucuya hiç gitmeden uyarılır', async () => {
    show('/mesai/qr1');
    expect(await screen.findByText('Bu telefon eşleşmemiş')).toBeInTheDocument();
    expect(rpc.callRpc).not.toHaveBeenCalled();
  });

  it('okutma: konum gerekmiyorsa doğrudan kaydeder, çıkışta süreyi gösterir', async () => {
    localStorage.setItem(DEVICE_KEY, TOKEN);
    rpc.callRpc
      .mockResolvedValueOnce({ location: false })
      .mockResolvedValueOnce({ action: 'out', name: 'Ayşe', open: false, at: '2026-11-12 17:05', minutes: 485 });
    show('/mesai/qr1');
    expect(await screen.findByText('Mesai bitti')).toBeInTheDocument();
    expect(screen.getByText('17:05')).toBeInTheDocument();
    expect(screen.getByText('Toplam: 8 sa 5 dk')).toBeInTheDocument();
    expect(rpc.callRpc).toHaveBeenLastCalledWith('timeclock_scan', { p_qr: 'qr1', p_device: TOKEN });
  });

  it('konum gerekiyorsa o anki konumu yalnız bu çağrıda gönderir', async () => {
    localStorage.setItem(DEVICE_KEY, TOKEN);
    const getCurrentPosition = vi.fn((ok: PositionCallback) =>
      ok({ coords: { latitude: 52.5, longitude: 13.4, accuracy: 12 } } as GeolocationPosition),
    );
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
    rpc.callRpc
      .mockResolvedValueOnce({ location: true })
      .mockResolvedValueOnce({ action: 'in', name: 'Ayşe', open: true, at: '2026-11-12 09:00' });
    show('/mesai/qr1');
    expect(await screen.findByText('Mesai başladı')).toBeInTheDocument();
    expect(rpc.callRpc).toHaveBeenLastCalledWith('timeclock_scan', {
      p_qr: 'qr1',
      p_device: TOKEN,
      p_lat: 52.5,
      p_lng: 13.4,
      p_accuracy: 12,
    });
    vi.unstubAllGlobals();
  });

  it('eski QR söylenir', async () => {
    localStorage.setItem(DEVICE_KEY, TOKEN);
    rpc.callRpc.mockRejectedValueOnce(new RpcError('timeclock_bad_qr'));
    show('/mesai/eski');
    expect(await screen.findByText('Bu QR kod geçersiz')).toBeInTheDocument();
  });

  it('adres QR olmadan açılırsa yalnız bilgi gösterir', () => {
    show('/mesai');
    expect(screen.getByText('Mesai kaydı')).toBeInTheDocument();
    expect(rpc.callRpc).not.toHaveBeenCalled();
  });
});

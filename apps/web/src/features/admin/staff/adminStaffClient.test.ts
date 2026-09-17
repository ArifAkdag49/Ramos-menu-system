import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Oturum jetonu gerçek Supabase istemcisinden değil, sahte `getSession`'dan gelir: test ağ
// isteğinin **biçimini** ölçer (başlıklar, gövde, hata eşlemesi), oturum kurmayı değil.
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('../../../lib/supabase', () => ({ supabase: { auth } }));

import { AdminStaffError, callAdminStaff } from './adminStaffClient';

const URL = 'https://proje.supabase.co';
const ANON = 'anon-anahtar';

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('callAdminStaff', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', URL);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', ANON);
    vi.stubGlobal('fetch', fetchMock);
    auth.getSession.mockResolvedValue({ data: { session: { access_token: 'jeton-123' } } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('201 { user_id } → değeri döndürür', async () => {
    fetchMock.mockResolvedValue(reply(201, { user_id: 'u-1' }));
    await expect(callAdminStaff({ action: 'create' })).resolves.toEqual({ user_id: 'u-1' });
  });

  it('409 username_taken → AdminStaffError { key, status }', async () => {
    fetchMock.mockResolvedValue(reply(409, { error: 'username_taken' }));
    const err = await callAdminStaff({ action: 'create' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdminStaffError);
    expect(err).toMatchObject({ key: 'username_taken', status: 409 });
  });

  it('gövdesi okunamayan hata yanıtı → key unknown, durum kodu korunur', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    await expect(callAdminStaff({ action: 'update' })).rejects.toMatchObject({
      key: 'unknown',
      status: 502,
    });
  });

  it('ağ hatası → key network', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(callAdminStaff({ action: 'create' })).rejects.toMatchObject({
      key: 'network',
      status: 0,
    });
  });

  it('oturum yoksa istek hiç gitmez → not_authorized', async () => {
    auth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(callAdminStaff({ action: 'create' })).rejects.toMatchObject({
      key: 'not_authorized',
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('istek Authorization: Bearer <jeton> ve apikey başlıklarıyla POST edilir', async () => {
    fetchMock.mockResolvedValue(reply(200, {}));
    await callAdminStaff({ action: 'update', user_id: 'u-9', display_name: 'Ayşe' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${URL}/functions/v1/admin-staff`);
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jeton-123');
    expect(headers.apikey).toBe(ANON);
    expect(JSON.parse(String(init?.body))).toEqual({
      action: 'update',
      user_id: 'u-9',
      display_name: 'Ayşe',
    });
  });
});

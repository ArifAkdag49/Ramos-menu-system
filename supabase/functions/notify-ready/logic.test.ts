import { describe, expect, it } from 'vitest';
import {
  FCM_SCOPE,
  GOOGLE_TOKEN_URL,
  buildFcmMessage,
  buildNotification,
  createFcmAccessTokenProvider,
  fcmJwtClaims,
  fcmOutcome,
  fcmSendUrl,
  localTableName,
  normalizeLocale,
  parseServiceAccount,
  pushOutcome,
  signFcmJwt,
  splitTargets,
  verifyWebhookSecret,
  type PushTarget,
  type ReadyOrder,
  type ServiceAccount,
} from './logic';

const order: ReadyOrder = {
  id: '6f1c2b1e-8d4a-4c1b-9a53-0d6c7f1e2a90',
  order_no: 47,
  table: 'Tisch 12',
  items: [
    { qty: 2, code: '05', name: 'Drehspieß Sandwich' },
    { qty: 1, code: '59', name: 'Kuzu Şiş' },
    { qty: 3, code: null, name: 'Cola 0,33 l' },
    { qty: 1, code: null, name: 'Ayran 0,25 l' },
  ],
};

describe('buildNotification', () => {
  it('Türkçe: masa adı yerelleşir, ilk 3 kalem + fazlası', () =>
    expect(buildNotification(order, 'tr')).toEqual({
      title: 'Masa 12 · #047 hazır',
      body: '2x 05 Drehspieß Sandwich, 1x 59 Kuzu Şiş, 3x Cola 0,33 l +1',
      tag: order.id,
      url: '/waiter/ready',
    }));

  it('Almanca: DB adı korunur', () => {
    const n = buildNotification(order, 'de');
    expect(n.title).toBe('Tisch 12 · #047 fertig');
    expect(n.body).toBe('2x 05 Drehspieß Sandwich, 1x 59 Kuzu Şiş, 3x Cola 0,33 l +1');
  });

  it('3 ve daha az kalemde "+N" yok; üç haneden büyük numara kırpılmaz', () => {
    const n = buildNotification({ ...order, order_no: 1234, items: order.items.slice(0, 3) }, 'tr');
    expect(n.title).toBe('Masa 12 · #1234 hazır');
    expect(n.body).toBe('2x 05 Drehspieß Sandwich, 1x 59 Kuzu Şiş, 3x Cola 0,33 l');
  });

  it('kalemsiz sipariş boş gövde verir', () =>
    expect(buildNotification({ ...order, items: [] }, 'de').body).toBe(''));

  it('tag sipariş kimliğidir (günlük numara tekrar edebilir)', () =>
    expect(buildNotification({ ...order, id: 'abc' }, 'tr').tag).toBe('abc'));
});

describe('localTableName', () => {
  it('TR: yalnız baştaki "Tisch" kelimesi "Masa" olur', () => {
    expect(localTableName('Tisch 12', 'tr')).toBe('Masa 12');
    expect(localTableName('Tisch', 'tr')).toBe('Masa');
    expect(localTableName('Tischler 3', 'tr')).toBe('Tischler 3');
    expect(localTableName('Test-Tisch', 'tr')).toBe('Test-Tisch');
    expect(localTableName('Terrasse 1', 'tr')).toBe('Terrasse 1');
  });
  it('DE: ad aynen kalır', () => expect(localTableName('Tisch 12', 'de')).toBe('Tisch 12'));
});

describe('normalizeLocale', () => {
  it('bilinmeyen dil Türkçeye düşer', () => {
    expect(normalizeLocale('de')).toBe('de');
    expect(normalizeLocale('tr')).toBe('tr');
    expect(normalizeLocale('en')).toBe('tr');
    expect(normalizeLocale(null)).toBe('tr');
  });
});

describe('verifyWebhookSecret', () => {
  it('yalnız birebir eşleşme kabul edilir', () => {
    expect(verifyWebhookSecret('s3cr3t-value', 's3cr3t-value')).toBe(true);
    expect(verifyWebhookSecret('s3cr3t-valuf', 's3cr3t-value')).toBe(false);
    expect(verifyWebhookSecret('s3cr3t-value-x', 's3cr3t-value')).toBe(false);
    expect(verifyWebhookSecret('s3cr3t', 's3cr3t-value')).toBe(false);
    expect(verifyWebhookSecret('', 's3cr3t-value')).toBe(false);
    expect(verifyWebhookSecret(null, 's3cr3t-value')).toBe(false);
  });
  it('sunucuda sır tanımlı değilse her şey reddedilir', () => {
    expect(verifyWebhookSecret('', '')).toBe(false);
    expect(verifyWebhookSecret('x', undefined)).toBe(false);
    expect(verifyWebhookSecret(null, undefined)).toBe(false);
  });
  it('çok baytlı karakterler de doğru karşılaştırılır', () => {
    expect(verifyWebhookSecret('şifre', 'şifre')).toBe(true);
    expect(verifyWebhookSecret('sifre', 'şifre')).toBe(false);
  });
});

describe('pushOutcome', () => {
  it('2xx başarı, 404/410 abonelik ölü, diğerleri geçici hata', () => {
    expect(pushOutcome(201)).toBe('ok');
    expect(pushOutcome(200)).toBe('ok');
    expect(pushOutcome(404)).toBe('gone');
    expect(pushOutcome(410)).toBe('gone');
    expect(pushOutcome(400)).toBe('failed');
    expect(pushOutcome(403)).toBe('failed');
    expect(pushOutcome(413)).toBe('failed');
    expect(pushOutcome(429)).toBe('failed');
    expect(pushOutcome(500)).toBe('failed');
  });
});

// ---------- FCM HTTP v1 (0013: yerel Android uygulaması) ----------
const b64urlJson = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;

async function testServiceAccount(): Promise<{ sa: ServiceAccount; publicKey: CryptoKey }> {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
  return {
    sa: { project_id: 'ramos-test', client_email: 'fcm@ramos-test.iam.gserviceaccount.com', private_key: pem },
    publicKey: kp.publicKey,
  };
}

describe('parseServiceAccount', () => {
  it('geçerli JSON: yalnız gereken üç alan', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nAA\n-----END PRIVATE KEY-----\n';
    expect(parseServiceAccount(JSON.stringify({ type: 'service_account', project_id: 'p', client_email: 'e@x',
      private_key: pem, private_key_id: 'k' })))
      .toEqual({ project_id: 'p', client_email: 'e@x', private_key: pem });
  });
  it('sır yok / bozuk / eksik alan → null (FCM hedefleri atlanır)', () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount('')).toBeNull();
    expect(parseServiceAccount('{bozuk')).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ project_id: 'p', client_email: 'e@x' }))).toBeNull();
    expect(parseServiceAccount(JSON.stringify(['x']))).toBeNull();
  });
});

describe('signFcmJwt (RS256)', () => {
  it('başlık, claim alanları ve imza doğru', async () => {
    const { sa, publicKey } = await testServiceAccount();
    const jwt = await signFcmJwt(sa, 1_800_000_000);
    const [h, p, s] = jwt.split('.');
    expect(b64urlJson(h!)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(b64urlJson(p!)).toEqual({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, Buffer.from(s!, 'base64url'),
      new TextEncoder().encode(`${h}.${p}`));
    expect(ok).toBe(true);
  });
  it('claim yardımcısı saf', () =>
    expect(fcmJwtClaims({ project_id: 'p', client_email: 'e@x', private_key: '' }, 10)).toEqual({
      iss: 'e@x', scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat: 10, exp: 3610 }));
});

describe('createFcmAccessTokenProvider', () => {
  it('jetonu önbellekler, süresinden 60 sn önce yeniler', async () => {
    const { sa } = await testServiceAccount();
    let now = 1_000_000;
    const calls: { url: string; body: string }[] = [];
    const get = createFcmAccessTokenProvider({
      fetch: async (url, init) => {
        calls.push({ url, body: init.body });
        return new Response(JSON.stringify({ access_token: `tok${calls.length}`, expires_in: 3600 }), { status: 200 });
      },
      nowMs: () => now,
    });
    expect(await get(sa)).toBe('tok1');
    expect(calls[0]!.url).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(calls[0]!.body);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(form.get('assertion')!.split('.')).toHaveLength(3);

    now += (3600 - 61) * 1000; // bitimine 61 sn: önbellekten
    expect(await get(sa)).toBe('tok1');
    now += 2000; // bitimine 59 sn: yenilenir
    expect(await get(sa)).toBe('tok2');
    expect(calls).toHaveLength(2);
  });
  it('token uç noktası hata verirse fırlatır ve önbelleğe almaz', async () => {
    const { sa } = await testServiceAccount();
    let fail = true;
    const get = createFcmAccessTokenProvider({
      fetch: async () => (fail
        ? new Response('{"error":"invalid_grant"}', { status: 400 })
        : new Response(JSON.stringify({ access_token: 'ok', expires_in: 3600 }), { status: 200 })),
      nowMs: () => 0,
    });
    await expect(get(sa)).rejects.toThrow(/400/);
    fail = false;
    expect(await get(sa)).toBe('ok');
  });
});

describe('buildFcmMessage', () => {
  it('bildirim + data (url, tag, order_id) + Android yüksek öncelik, kanal ramos_ready', () => {
    const n = buildNotification(order, 'tr');
    expect(buildFcmMessage('TOKEN-1', n, order.id)).toEqual({
      message: {
        token: 'TOKEN-1',
        notification: { title: 'Masa 12 · #047 hazır', body: n.body },
        data: { url: '/waiter/ready', tag: order.id, order_id: order.id },
        android: { priority: 'HIGH', notification: { channel_id: 'ramos_ready', tag: order.id } },
      },
    });
    expect(fcmSendUrl('ramos-test')).toBe('https://fcm.googleapis.com/v1/projects/ramos-test/messages:send');
  });
});

describe('fcmOutcome', () => {
  const err = (status: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ error: { code: 0, status, message: 'x', ...extra } });
  const unregistered = { details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] };
  it('2xx ok; 404 ve UNREGISTERED silinir', () => {
    expect(fcmOutcome(200, '{"name":"projects/p/messages/1"}')).toBe('ok');
    expect(fcmOutcome(404, err('NOT_FOUND'))).toBe('gone');
    expect(fcmOutcome(404, '')).toBe('gone');
    expect(fcmOutcome(400, err('INVALID_ARGUMENT', unregistered))).toBe('gone');
    expect(fcmOutcome(403, err('PERMISSION_DENIED', unregistered))).toBe('gone');
    expect(fcmOutcome(404, err('UNREGISTERED'))).toBe('gone');
  });
  it('INVALID_ARGUMENT yalnız jeton hatasıysa silinir', () => {
    expect(fcmOutcome(400, err('INVALID_ARGUMENT', { message: 'The registration token is not a valid FCM registration token' })))
      .toBe('gone');
    expect(fcmOutcome(400, err('INVALID_ARGUMENT', {
      details: [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'message.token' }] }] })))
      .toBe('gone');
    expect(fcmOutcome(400, err('INVALID_ARGUMENT', { message: 'Invalid value at message.android.priority' })))
      .toBe('failed');
  });
  it('diğerleri geçici', () => {
    expect(fcmOutcome(401, err('UNAUTHENTICATED'))).toBe('failed');
    expect(fcmOutcome(429, err('RESOURCE_EXHAUSTED'))).toBe('failed');
    expect(fcmOutcome(500, 'bozuk')).toBe('failed');
    expect(fcmOutcome(503, '')).toBe('failed');
  });
});

describe('splitTargets', () => {
  const t = (id: string, kind: 'webpush' | 'fcm'): PushTarget =>
    ({ id, kind, endpoint: id, p256dh: kind === 'webpush' ? 'k' : null, auth: kind === 'webpush' ? 'a' : null, locale: 'tr' });
  it('Web Push ve FCM ayrılır; kind yoksa webpush sayılır', () => {
    const legacy = { id: 'old', endpoint: 'e', p256dh: 'k', auth: 'a', locale: null } as unknown as PushTarget;
    expect(splitTargets([t('w', 'webpush'), t('f', 'fcm'), legacy], true))
      .toEqual({ webpush: [t('w', 'webpush'), legacy], fcm: [t('f', 'fcm')], skipped: 0 });
  });
  it('FCM sırrı yoksa FCM hedefleri atlanır (silinmez)', () =>
    expect(splitTargets([t('w', 'webpush'), t('f', 'fcm'), t('g', 'fcm')], false))
      .toEqual({ webpush: [t('w', 'webpush')], fcm: [], skipped: 2 }));
});

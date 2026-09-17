import { describe, expect, it } from 'vitest';
import {
  buildNotification,
  localTableName,
  normalizeLocale,
  pushOutcome,
  verifyWebhookSecret,
  type ReadyOrder,
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

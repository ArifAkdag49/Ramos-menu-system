import type { Query } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { qk } from '../data/keys';
import { PERSIST_MAX_AGE_MS, queryClient } from './queryClient';
import {
  CACHE_STORAGE_KEY,
  claimPersistedQueries,
  clearPersistedQueries,
  isPersistedKey,
  OWNER_STORAGE_KEY,
  persistOptions,
} from './queryPersist';

const dehydrate = persistOptions.dehydrateOptions?.shouldDehydrateQuery;

/** `shouldDehydrateQuery`'nin gerçekten baktığı iki alan: durum ve anahtar. */
const queryOf = (queryKey: readonly unknown[], status = 'success') =>
  ({ queryKey, state: { status } }) as unknown as Query;

beforeEach(() => {
  localStorage.clear();
  queryClient.clear();
});
afterEach(() => localStorage.clear());

describe('isPersistedKey — diske YAZILAN okumalar', () => {
  it('menü, masalar, ayarlar ve personel listesi yazılır', () => {
    expect(isPersistedKey(qk.menu)).toBe(true);
    expect(isPersistedKey([...qk.menu, 'products'])).toBe(true);
    expect(isPersistedKey(qk.adminProducts)).toBe(true);
    expect(isPersistedKey(qk.tables)).toBe(true);
    expect(isPersistedKey(qk.adminTables)).toBe(true);
    expect(isPersistedKey(qk.settings)).toBe(true);
    expect(isPersistedKey(qk.adminStaff)).toBe(true);
  });

  it('eskimesi tehlikeli olanlar yazılmaz', () => {
    // Eskimiş bir "HAZIR" listesi garsonu yanlış masaya yürütür ve uygulama içi uyarıyı
    // diskten gelen veriyle yanlışlıkla çaldırır (Görev 26).
    expect(isPersistedKey(qk.ready)).toBe(false);
    expect(isPersistedKey(qk.kitchen)).toBe(false);
    expect(isPersistedKey(qk.sessionOrders('s1'))).toBe(false);
    expect(isPersistedKey(qk.session('t1'))).toBe(false);
    // Eskimiş "yazıcı iyi" bilgisi basılmayan fişi gizler.
    expect(isPersistedKey(qk.printer)).toBe(false);
    // Para ve denetim çıktısı: ya taze ya hiç.
    expect(isPersistedKey(qk.bill('s1'))).toBe(false);
    expect(isPersistedKey(qk.report('2026-01-01', '2026-01-02'))).toBe(false);
    expect(isPersistedKey(qk.audit(50))).toBe(false);
    expect(isPersistedKey(['public-menu'])).toBe(false);
  });

  it('`staff` anahtarının kendisi yazılmaz — değeri bir Map', () => {
    // JSON'a yazılıp düz nesne olarak geri gelirse `staffNames.get(...)` çağıran her ekran patlar.
    expect(isPersistedKey(qk.staff)).toBe(false);
  });

  it('ön ek benzerliği yetmez, gerçek ön ek olmalı', () => {
    expect(isPersistedKey(['menus'])).toBe(false);
    expect(isPersistedKey(['tables-admin'])).toBe(false);
  });
});

describe('persistOptions', () => {
  it('yalnız BAŞARILI ve izinli sorgular yazılır', () => {
    expect(dehydrate?.(queryOf(qk.tables))).toBe(true);
    expect(dehydrate?.(queryOf(qk.tables, 'error'))).toBe(false);
    expect(dehydrate?.(queryOf(qk.tables, 'pending'))).toBe(false);
    expect(dehydrate?.(queryOf(qk.ready))).toBe(false);
  });

  it('buster derlemeye bağlıdır — yeni sürüm eski şekli okumaz', () => {
    expect(persistOptions.buster).toBe(__RAMOS_BUILD_ID__);
    expect(persistOptions.buster).toBeTruthy();
  });

  it('ömür 24 saat', () => {
    expect(persistOptions.maxAge).toBe(PERSIST_MAX_AGE_MS);
    expect(PERSIST_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('clearPersistedQueries', () => {
  it('belleği ve diski birlikte boşaltır', () => {
    queryClient.setQueryData(qk.tables, [{ table_id: 't1' }]);
    localStorage.setItem(CACHE_STORAGE_KEY, '{"timestamp":1}');
    localStorage.setItem(OWNER_STORAGE_KEY, 'u1');

    clearPersistedQueries();

    expect(queryClient.getQueryData(qk.tables)).toBeUndefined();
    expect(localStorage.getItem(CACHE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(OWNER_STORAGE_KEY)).toBeNull();
  });
});

describe('claimPersistedQueries — hesap değişimi', () => {
  it('ilk sahiplenmede önbellek sahibine yazılır', () => {
    claimPersistedQueries('u1');
    expect(localStorage.getItem(OWNER_STORAGE_KEY)).toBe('u1');
  });

  it('aynı kullanıcı geri gelirse önbellek KORUNUR', () => {
    claimPersistedQueries('u1');
    queryClient.setQueryData(qk.tables, [{ table_id: 't1' }]);
    localStorage.setItem(CACHE_STORAGE_KEY, '{"timestamp":1}');

    claimPersistedQueries('u1');

    expect(queryClient.getQueryData(qk.tables)).toEqual([{ table_id: 't1' }]);
    expect(localStorage.getItem(CACHE_STORAGE_KEY)).toBe('{"timestamp":1}');
  });

  it('başka bir garson devralırsa önbellek atılır', () => {
    claimPersistedQueries('u1');
    queryClient.setQueryData(qk.tables, [{ table_id: 't1' }]);
    localStorage.setItem(CACHE_STORAGE_KEY, '{"timestamp":1}');

    claimPersistedQueries('u2');

    expect(queryClient.getQueryData(qk.tables)).toBeUndefined();
    expect(localStorage.getItem(CACHE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(OWNER_STORAGE_KEY)).toBe('u2');
  });

  it('kullanıcı yoksa (oturum kapalı) önbellek kalmaz', () => {
    claimPersistedQueries('u1');
    localStorage.setItem(CACHE_STORAGE_KEY, '{"timestamp":1}');

    claimPersistedQueries(null);

    expect(localStorage.getItem(CACHE_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(OWNER_STORAGE_KEY)).toBeNull();
  });
});

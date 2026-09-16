import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanupFixtureOrders, ensureFixtures, type Fixtures } from '../../../supabase/tests/helpers/fixtures';
import { clientFor, ensureTestUsers } from '../../../supabase/tests/helpers/users';

export { cleanupFixtureOrders, ensureFixtures, hideFixtures, type Fixtures } from '../../../supabase/tests/helpers/fixtures';
export { clientFor, ensureTestUsers } from '../../../supabase/tests/helpers/users';

/**
 * `supabase/tests/helpers/*` (Plan 1) doğrudan `process.env`'i okur (Management API PAT,
 * service_role, proje ref). `playwright.config.ts` kök `.env`'i bilerek **bütünüyle yüklemez** —
 * webServer (`npm run dev`) bu süreçten env miras alır, o yüzden orada yalnız `TEST_USER_PASSWORD`
 * okunur. Bu dosya yalnız test dosyaları içeriden (`kitchen.spec.ts`) çağırdığında, yani
 * webServer çoktan ayağa kalktıktan **sonra**, çalışır — bu yüzden buradaki değerlerin dev
 * sunucusuna miras kalma riski yoktur. `service_role`/PAT burada kullanılır çünkü bu dizin
 * global-constraints §Sırlar'daki "testler" istisnasına girer (uygulama koduna değil, yalnız
 * Playwright test sürecine yüklenir; Vite bundle'ına asla girmez).
 */
function loadEnvKeys(keys: string[]) {
  let text: string;
  try {
    text = readFileSync('../../.env', 'utf8');
  } catch {
    return;
  }
  for (const key of keys) {
    if (process.env[key]) continue;
    const match = new RegExp(`^${key}=(.*)$`, 'm').exec(text);
    if (match?.[1] !== undefined) process.env[key] = match[1].trim();
  }
}

loadEnvKeys([
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_ACCESS_TOKEN',
  'STAFF_EMAIL_DOMAIN',
  'TEST_USER_PASSWORD',
]);

/**
 * KDS e2e testi için garson hesabıyla `submit_order` çağırır: 05 Kalb, OHNE Zwiebeln, Knoblauch
 * (spec §8.6 senaryosuyla aynı kalem). Testin kendisi UI üzerinden değil API'den gönderir —
 * ekranın **kendisini** doğrulamak istiyoruz, sipariş girişini değil (o Görev 14/waiter.spec.ts'te).
 */
export async function submitKitchenTestOrder(f: Fixtures): Promise<{ orderId: string; client: SupabaseClient }> {
  const waiter = await clientFor('waiter');
  const orderId = crypto.randomUUID();
  const items = [
    {
      product_id: f.doenerId,
      variant_id: f.variantK,
      quantity: 1,
      option_ids: [f.sauceA],
      removed_ingredient_ids: [f.ingZwiebeln],
    },
  ];
  const { error } = await waiter.rpc('submit_order', {
    p_order_id: orderId,
    p_table_id: f.tableId,
    p_items: items,
  });
  if (error) throw error;
  return { orderId, client: waiter };
}

export async function prepareKitchenFixtures(): Promise<Fixtures> {
  await ensureTestUsers();
  const f = await ensureFixtures();
  await cleanupFixtureOrders();
  return f;
}

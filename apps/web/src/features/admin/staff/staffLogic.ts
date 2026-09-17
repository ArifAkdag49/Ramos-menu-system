import { businessDate } from '../dashboardLogic';

/**
 * "Mesaide" rozeti. Sunucu `on_duty_since`'i mesai bitince boşaltır, ama garson "Mesaiyi bitir"e
 * basmadan eve giderse değer ertesi güne taşınır. Dünden kalan bir işaret "şu an mesaide" diye
 * gösterilirse admin yanlış kişiyi arar; bu yüzden yalnız **bugünkü iş günü** (Berlin 05:00
 * kuralı, `businessDate`) içinde başlayan mesai sayılır.
 */
export function isOnDuty(onDutySince: string | null, now: Date): boolean {
  if (!onDutySince) return false;
  const since = new Date(onDutySince);
  if (Number.isNaN(since.getTime())) return false;
  return businessDate(since) === businessDate(now);
}

/**
 * Test ve demo hesapları (`test-admin`, `test-e2e-garson`, `demo-garson` …) gerçek personelle aynı
 * listede durur; canlıya geçmeden (M8) pasifleştirilmeleri gerekir. Önek tireyle birlikte aranır:
 * "testci" ya da "contest-1" gerçek bir kullanıcı adı olabilir.
 */
export const isTestAccount = (username: string): boolean => /^(test|demo)-/.test(username);

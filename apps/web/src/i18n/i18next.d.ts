import 'i18next';
import type tr from './tr.json';

/**
 * R63 — i18next tip artırımı. Bundan sonra `t('waiter.cart.send')` tip denetiminden geçer:
 * olmayan bir anahtar derleme hatası verir, dolayısıyla çeviri dosyasından anahtar silmek ya da
 * yazım hatası yapmak sessizce "waiter.cart.send" metnini ekrana basmakla sonuçlanmaz.
 *
 * Kaynak olarak TR seçilir çünkü `i18n.test.ts` TR ile DE'nin anahtar kümesini birebir eşit
 * tutar — iki dosyadan hangisinin seçildiği anlam değiştirmez, ikisi de aynı sözleşmedir.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof tr };
  }
}

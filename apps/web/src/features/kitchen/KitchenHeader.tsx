import { PackageX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMenu } from '../../data/menu';
import { Button } from '../../ui/Button';
import { TONE_SOLID } from '../../ui/tone';
import { soldOutCount } from './kitchenLogic';

/** Üst şerit: ekran başlığı ve "Tükendi" paneline erişim. Yükseklik `--header-h` tokenından gelir
 *  (R81): mutfakta bir panel açıkken hata toast'ı üst konuma geçiyor ve ofsetini aynı tokendan
 *  alıyor — başlık kendi yüksekliğini ayrı yazarsa toast ya üstüne biner ya da boşluk bırakır. */
export function KitchenHeader({ onOpenSoldOut }: { onOpenSoldOut: () => void }) {
  const { t } = useTranslation();
  const { products } = useMenu();
  const count = soldOutCount(products);

  return (
    <header className="sticky top-0 z-10 flex h-[var(--header-h)] items-center justify-between gap-3 border-b border-border bg-surface px-6">
      <h1 className="text-2xl font-semibold">{t('kitchen.title')}</h1>
      <Button variant="secondary" icon={<PackageX aria-hidden size={20} />} onClick={onOpenSoldOut}>
        {t('kitchen.soldOut.button')}
        {/* O10 — paneli açmadan "kaç ürün tükendi" görünür. Sayı görsel bir rozet; erişilebilir ad
            "Tükendi 4" gibi yarım bir cümle olmasın diye tam cümle sr-only olarak eklenir. */}
        {count > 0 ? (
          <>
            <span
              aria-hidden
              className={`ml-2 inline-flex min-w-6 items-center justify-center rounded-full border px-1.5 tabular ${TONE_SOLID.danger}`}
            >
              {count}
            </span>
            <span className="sr-only">{t('kitchen.soldOut.count', { count })}</span>
          </>
        ) : null}
      </Button>
    </header>
  );
}

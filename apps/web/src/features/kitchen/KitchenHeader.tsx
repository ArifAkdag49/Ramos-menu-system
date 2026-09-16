import { PackageX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';

/** Üst şerit: ekran başlığı ve "Tükendi" paneline erişim. */
export function KitchenHeader({ onOpenSoldOut }: { onOpenSoldOut: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface px-6 py-4">
      <h1 className="text-2xl font-semibold">{t('kitchen.title')}</h1>
      <Button variant="secondary" icon={<PackageX aria-hidden size={20} />} onClick={onOpenSoldOut}>
        {t('kitchen.soldOut.button')}
      </Button>
    </header>
  );
}

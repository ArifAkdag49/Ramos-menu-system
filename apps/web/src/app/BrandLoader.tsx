import { Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../ui/Spinner';

/** Açılış ekranlarının marka satırı (alev + RAMO'S). */
export function Brand() {
  return (
    <>
      <Flame aria-hidden size={40} className="text-lime" />
      <p className="text-3xl font-bold tracking-tight">RAMO&apos;S</p>
    </>
  );
}

/** Tam ekran marka yükleyicisi: oturum açılışı ve ayrı parçada gelen admin bölümü (Görev 27). */
export function BrandLoader() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <Brand />
      <Spinner className="text-muted" label={t('common.loading')} />
    </div>
  );
}

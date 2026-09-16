import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const minutesSince = (iso: string): number => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));

/**
 * Açılıştan beri geçen dakika (masa kartı). Görsel bir ayrıntıdır, kullanıcı eylemini
 * gerektirmez ve dakikada bir değiştiği için canlı bölge olarak duyurulmaz (Toast/Banner'ın
 * aksine) — sürekli seslendirme garsonu rahatsız eder.
 */
export function Elapsed({ since, className }: { since: string; className?: string }) {
  const { t } = useTranslation();
  // Dakika değeri her render'da `since` ve şimdiki zamandan türetilir (state ile aynalanmaz);
  // efekt yalnız periyodik yeniden render'ı tetikler (react-hooks/set-state-in-effect).
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  return <span className={className}>{t('common.elapsedMinutes', { count: minutesSince(since) })}</span>;
}

import { formatOrderNo, localTableName, type Locale } from '@ramos/shared';
import { BellRing } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMatch, useNavigate } from 'react-router';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { useReadyAlerts } from './useReadyAlerts';

/**
 * "Masa 12 · #047 hazır → Göster" şeridi. Garson iskeletinin üstünde, başlığın altına yapışık
 * durur (liste kaydırılsa da görünür). Hazır sekmesindeyken gösterilmez — liste zaten orada.
 */
export function ReadyAlertBanner() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';
  const navigate = useNavigate();
  const onReadyPage = useMatch('/waiter/ready') !== null;
  const { latest, more, dismiss } = useReadyAlerts();

  // Hazır listesine bakan garson uyarıyı görmüş sayılır.
  useEffect(() => {
    if (onReadyPage && latest) dismiss();
  }, [onReadyPage, latest, dismiss]);

  if (!latest || onReadyPage) return null;

  const title = t('waiter.readyAlert.title', {
    table: localTableName(latest.table_name, locale),
    orderNo: formatOrderNo(latest.order_no),
  });

  return (
    <div className="sticky top-[var(--header-h)] z-10 bg-bg px-4 pt-3">
      <Banner
        tone="ready"
        icon={<BellRing aria-hidden size={22} className="shrink-0" />}
        action={
          <Button
            onClick={() => {
              dismiss();
              navigate('/waiter/ready');
            }}
          >
            {t('waiter.readyAlert.show')}
          </Button>
        }
      >
        <span className="block font-semibold">{title}</span>
        {more > 0 ? (
          <span className="block text-sm">{t('waiter.readyAlert.more', { count: more })}</span>
        ) : null}
      </Banner>
    </div>
  );
}

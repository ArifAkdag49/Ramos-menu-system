import { Printer, Radio, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePrinterStatus } from '../../data/printer';
import { useOnline } from '../../lib/online';
import { useBroadcastInvalidation, type Topic } from '../../lib/realtime';
import { Banner } from '../../ui/Banner';

/**
 * Garson ve KDS ortak bağlantı şeridi. Tek seferde en fazla bir şerit gösterilir, öncelik:
 * 1) internet yok (kırmızı) 2) canlı bağlantı koptu (turuncu) 3) yazıcı sorunu (turuncu).
 * `printer_reachable === null` (bilinmiyor) hiçbir zaman "çevrimdışı" olarak gösterilmez —
 * bu ayrım `derivePrinterProblem` içinde zaten yapılıyor (Görev 12).
 */
export function ConnectionBanners({ topics }: { topics: Topic[] }) {
  const { t } = useTranslation();
  const online = useOnline();
  const realtimeState = useBroadcastInvalidation(topics);
  const { problem } = usePrinterStatus();

  let content: ReactNode = null;
  if (!online) {
    content = (
      <Banner tone="danger" icon={<WifiOff aria-hidden size={20} />}>
        {t('waiter.banner.offline')}
      </Banner>
    );
  } else if (realtimeState === 'offline') {
    content = (
      <Banner tone="warning" icon={<Radio aria-hidden size={20} />}>
        {t('waiter.banner.realtimeOffline')}
      </Banner>
    );
  } else if (problem) {
    content = (
      <Banner tone="warning" icon={<Printer aria-hidden size={20} />}>
        {t(`printer.${problem}`)}
      </Banner>
    );
  }

  if (!content) return null;
  return <div className="px-4 py-2">{content}</div>;
}

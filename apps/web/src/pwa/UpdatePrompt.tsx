import { RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { usePwaUpdate } from './updateStore';

/**
 * "Yeni sürüm hazır — Yenile". Ekranın üstünde, her rolde (garson, mutfak, admin, giriş) aynı.
 * Açık bir panelin (`Sheet`, z-50) altında kalır: panel işi bitmeden sayfa yenilenmesin.
 */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const update = usePwaUpdate((s) => s.update);
  const [busy, setBusy] = useState(false);

  if (!update) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-[calc(0.5rem+env(safe-area-inset-top))]">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-card border border-info/40 bg-surface-2 py-2 pl-4 pr-2 shadow-[var(--shadow-overlay)]"
      >
        <RefreshCw aria-hidden size={20} className="shrink-0 text-info" />
        <span className="flex-1 text-base">{t('pwa.update.ready')}</span>
        <Button
          loading={busy}
          onClick={() => {
            setBusy(true);
            void update();
          }}
        >
          {t('pwa.update.reload')}
        </Button>
        <IconButton
          label={t('common.close')}
          icon={<X aria-hidden size={20} />}
          onClick={() => usePwaUpdate.getState().dismiss()}
          className="text-muted"
        />
      </div>
    </div>
  );
}

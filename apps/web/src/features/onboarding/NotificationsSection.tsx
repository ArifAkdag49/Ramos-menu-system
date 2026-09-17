import { clsx } from 'clsx';
import { Bell, BellOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { detectPlatform } from '../../pwa/platform';
import { usePush } from '../../pwa/pushStore';
import { Button } from '../../ui/Button';
import { useEnablePush } from './useEnablePush';

/**
 * Profil → Bildirimler: durum + aç/kapat. Açılamıyorsa neden ve ne yapılacağı yazılır
 * (iPhone'da ana ekrana ekleme, reddedilmiş izin, desteksiz tarayıcı, yerel uygulamada kayıt hatası).
 */
export function NotificationsSection() {
  const { t } = useTranslation();
  const [platform] = useState(detectPlatform);
  const state = usePush((s) => s.state);
  const busy = usePush((s) => s.busy);
  const enable = useEnablePush();

  useEffect(() => {
    void usePush.getState().refresh();
  }, []);

  let hint: string | null = null;
  if (state === 'denied') hint = t('pwa.push.hint.denied');
  // Yalnız yerel uygulama: bildirim kaydı yapılamadı (ör. Firebase'siz derleme) — sakin açıklama.
  else if (state === 'error') hint = t('pwa.push.hint.error');
  else if (state === 'unsupported')
    hint = t(
      platform.isIOS && !platform.standalone
        ? 'pwa.push.hint.ios_needs_install'
        : 'pwa.push.hint.unsupported',
    );

  const on = state === 'enabled';

  return (
    <section aria-labelledby="profile-notifications-label" className="flex flex-col gap-2">
      <h2 id="profile-notifications-label" className="text-sm font-medium text-muted">
        {t('pwa.push.title')}
      </h2>
      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
        <p className={clsx('flex items-start gap-2 text-base', on ? 'text-lime' : 'text-text')}>
          {on ? (
            <Bell aria-hidden size={20} className="mt-0.5 shrink-0" />
          ) : (
            <BellOff aria-hidden size={20} className="mt-0.5 shrink-0 text-muted" />
          )}
          <span>{t(`pwa.push.state.${state}`)}</span>
        </p>
        {hint ? <p className="text-sm text-muted">{hint}</p> : null}
        {state === 'disabled' ? (
          <Button icon={<Bell aria-hidden size={20} />} loading={busy} onClick={enable}>
            {t('pwa.push.enable')}
          </Button>
        ) : null}
        {on ? (
          <Button
            variant="secondary"
            icon={<BellOff aria-hidden size={20} />}
            loading={busy}
            onClick={() => void usePush.getState().disable()}
          >
            {t('pwa.push.disable')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

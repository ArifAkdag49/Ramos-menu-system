import { clsx } from 'clsx';
import {
  Bell,
  Check,
  Download,
  EllipsisVertical,
  Share,
  SquarePlus,
  Smartphone,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isNative } from '../../native/capacitor';
import { useInstallPrompt } from '../../pwa/installPrompt';
import { detectPlatform } from '../../pwa/platform';
import { usePush } from '../../pwa/pushStore';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { useEnablePush } from './useEnablePush';

const STORAGE_KEY = 'ramos-install-guide';

function readFlag(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeFlag(value: 'done' | 'dismissed'): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* özel mod: rehber bu oturumda yine gizli kalır, sonraki açılışta yeniden görünür */
  }
}

/**
 * Garsonun ilk açılışta gördüğü kurulum rehberi (Görev 25). Amaç tek: "Hazır" bildirimi
 * telefona gelsin. Adımlar platforma göre:
 *
 * | Durum                         | Gösterilen                                              |
 * |-------------------------------|---------------------------------------------------------|
 * | iPhone, ana ekranda değil     | Paylaş → Ana Ekrana Ekle → simgeden aç (push henüz yok)  |
 * | Android, yüklenmemiş          | "Uygulamayı yükle" (`beforeinstallprompt`) ya da menü    |
 * | Yüklü PWA / Android uygulaması| Kurulum adımı yok, doğrudan "Bildirimleri aç"            |
 * | Yerel Android uygulaması      | Kurulum adımı yok (zaten uygulama), bildirim FCM ile     |
 * | Bildirim açık                 | Rehber görünmez                                          |
 *
 * Sayfa içi bir karttır, modal değildir: garson isterse görmezden gelip çalışmaya devam eder,
 * kapatınca bir daha çıkmaz. Aynı ayar her zaman Profil → Bildirimler'de durur.
 */
export function InstallGuide() {
  const { t } = useTranslation();
  const [platform] = useState(detectPlatform);
  const [closed, setClosed] = useState(() => readFlag() !== null);
  const state = usePush((s) => s.state);
  const busy = usePush((s) => s.busy);
  const installEvent = useInstallPrompt((s) => s.event);
  const installed = useInstallPrompt((s) => s.installed);
  const enable = useEnablePush();

  useEffect(() => {
    if (!closed) void usePush.getState().refresh();
  }, [closed]);

  // Bildirim açıldıysa iş bitti: bir daha gösterme.
  useEffect(() => {
    if (!closed && state === 'enabled') writeFlag('done');
  }, [closed, state]);

  if (closed || state === 'loading' || state === 'enabled') return null;

  const dismiss = () => {
    writeFlag('dismissed');
    setClosed(true);
  };

  // Yerel uygulama (Capacitor) zaten yüklü uygulamadır: TWA'daki gibi "yükle" adımı yok.
  const showInstall = !platform.standalone && !isNative();

  let install: ReactNode;
  if (installed) {
    install = <p className="text-sm text-lime">{t('pwa.guide.installed')}</p>;
  } else if (platform.isIOS) {
    install = (
      <ol className="flex flex-col gap-2 text-sm">
        <Instruction icon={<Share aria-hidden size={18} />}>{t('pwa.guide.iosShare')}</Instruction>
        <Instruction icon={<SquarePlus aria-hidden size={18} />}>
          {t('pwa.guide.iosAdd')}
        </Instruction>
        <Instruction icon={<Smartphone aria-hidden size={18} />}>
          {t('pwa.guide.iosOpen')}
        </Instruction>
      </ol>
    );
  } else if (installEvent) {
    install = (
      <Button
        icon={<Download aria-hidden size={20} />}
        onClick={() => void useInstallPrompt.getState().promptInstall()}
      >
        {t('pwa.guide.installButton')}
      </Button>
    );
  } else {
    install = (
      <p className="flex items-start gap-2 text-sm text-muted">
        <EllipsisVertical aria-hidden size={18} className="mt-0.5 shrink-0" />
        <span>{t('pwa.guide.androidMenu')}</span>
      </p>
    );
  }

  let notify: ReactNode;
  if (state === 'disabled') {
    notify = (
      <Button icon={<Bell aria-hidden size={20} />} loading={busy} onClick={enable}>
        {t('pwa.push.enable')}
      </Button>
    );
  } else if (state === 'denied') {
    notify = <p className="text-sm text-muted">{t('pwa.push.hint.denied')}</p>;
  } else if (state === 'error') {
    notify = <p className="text-sm text-muted">{t('pwa.push.hint.error')}</p>;
  } else {
    notify = (
      <p className="text-sm text-muted">
        {t(
          platform.isIOS && !platform.standalone
            ? 'pwa.push.result.ios_needs_install'
            : 'pwa.push.hint.unsupported',
        )}
      </p>
    );
  }

  return (
    <section
      aria-labelledby="install-guide-title"
      className="mx-4 mt-3 rounded-card border border-lime/30 bg-surface p-4"
    >
      <div className="flex items-start gap-3">
        <img
          src="/app-icons/icon-192.png"
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 rounded-xl border border-border"
        />
        <div className="min-w-0 flex-1">
          <h2 id="install-guide-title" className="text-base font-semibold">
            {t('pwa.guide.title')}
          </h2>
          <p className="text-sm text-muted">{t('pwa.guide.subtitle')}</p>
        </div>
        <IconButton
          label={t('pwa.guide.close')}
          icon={<X aria-hidden size={20} />}
          onClick={dismiss}
          className="-mr-2 -mt-2 shrink-0 text-muted"
        />
      </div>

      <ol className="mt-4 flex flex-col gap-4">
        {showInstall ? (
          <Step
            n={1}
            done={installed}
            title={t('pwa.guide.installTitle')}
            doneLabel={t('pwa.guide.stepDone')}
          >
            {install}
          </Step>
        ) : null}
        <Step
          n={showInstall ? 2 : 1}
          title={t('pwa.guide.notifyTitle')}
          doneLabel={t('pwa.guide.stepDone')}
        >
          {notify}
        </Step>
      </ol>
    </section>
  );
}

function Step({
  n,
  title,
  done = false,
  doneLabel,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  doneLabel: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={clsx(
          'tabular inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold',
          done ? 'bg-lime text-bg' : 'border border-border bg-surface-2 text-text',
        )}
      >
        {done ? <Check aria-label={doneLabel} size={16} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-base font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

function Instruction({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-lime">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

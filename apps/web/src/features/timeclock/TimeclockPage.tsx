import { CircleCheck, CircleX, Clock, LogIn, LogOut, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { setLanguage, type Locale } from '../../i18n';
import { callRpc, hasRpcErrorKey } from '../../lib/rpc';
import { Spinner } from '../../ui/Spinner';
import { readDeviceToken, writeDeviceToken } from './deviceToken';

/**
 * Personelin telefonunda açılan mesai sayfası (girişsiz, 0020).
 *
 *   /mesai/:qr          duvardaki tek QR. Açılınca mesai başlar ya da biter; hangisi olduğuna sunucu karar verir.
 *   /mesai/bagla/:code  adminin ürettiği tek kullanımlık link: telefonu personele bağlar.
 *
 * İşlemden sonra adres `/mesai` olur: tarayıcı sekmeyi sonradan yeniden yüklerse (telefonda sık olur) ikinci
 * bir okutma gönderilmesin. Konum yalnız sunucu "gerekli" derse ve yalnız bu anda istenir; alınamazsa okutma
 * yine gider, panelde işaretlenir.
 */

type Busy = 'working' | 'locating';
type ErrorKind = 'notPaired' | 'badQr' | 'pairBad' | 'failed';

interface ScanResult {
  action: 'in' | 'out' | 'ignored';
  name: string;
  at: string;
  minutes?: number;
}

type View =
  | { kind: 'busy'; label: Busy }
  | { kind: 'idle' }
  | { kind: 'paired'; name: string }
  | ({ kind: 'done' } & ScanResult)
  | { kind: 'error'; error: ErrorKind };

/** O anki konum; hiçbir yerde saklanmaz. Alınamazsa boş döner (okutma yine gider). */
function locate(): Promise<{ p_lat?: number; p_lng?: number; p_accuracy?: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ p_lat: p.coords.latitude, p_lng: p.coords.longitude, p_accuracy: p.coords.accuracy }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  });
}

function errorOf(e: unknown): ErrorKind {
  if (hasRpcErrorKey(e, 'timeclock_not_paired')) return 'notPaired';
  if (hasRpcErrorKey(e, 'timeclock_bad_qr')) return 'badQr';
  if (hasRpcErrorKey(e, 'timeclock_bad_pair')) return 'pairBad';
  return 'failed';
}

const ERROR_TEXT = {
  notPaired: ['timeclock.notPaired', 'timeclock.notPairedHint'],
  badQr: ['timeclock.badQr', 'timeclock.badQrHint'],
  pairBad: ['timeclock.pairBad', 'timeclock.pairBadHint'],
  failed: ['timeclock.failed', 'timeclock.failedHint'],
} as const satisfies Record<ErrorKind, readonly [string, string]>;

const LOCALES: Locale[] = ['tr', 'de'];

export function TimeclockPage() {
  const { t, i18n } = useTranslation();
  const { qr, code } = useParams();
  const [view, setView] = useState<View>(qr || code ? { kind: 'busy', label: 'working' } : { kind: 'idle' });
  // StrictMode ve yeniden çizim bir okutmayı iki kez göndermesin.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const clearUrl = () => window.history.replaceState(null, '', '/mesai');

    if (code) {
      callRpc<{ token: string; name: string }>('timeclock_pair', { p_code: code })
        .then((r) => {
          writeDeviceToken(r.token);
          setView({ kind: 'paired', name: r.name });
        })
        .catch((e: unknown) => setView({ kind: 'error', error: errorOf(e) }))
        .finally(clearUrl);
      return;
    }
    if (!qr) return;

    void (async () => {
      try {
        const device = readDeviceToken();
        if (!device) {
          setView({ kind: 'error', error: 'notPaired' });
          return;
        }
        const config = await callRpc<{ location: boolean }>('timeclock_config', { p_qr: qr });
        let coords = {};
        if (config.location) {
          setView({ kind: 'busy', label: 'locating' });
          coords = await locate();
          setView({ kind: 'busy', label: 'working' });
        }
        const r = await callRpc<ScanResult>('timeclock_scan', { p_qr: qr, p_device: device, ...coords });
        setView({ kind: 'done', ...r });
      } catch (e) {
        setView({ kind: 'error', error: errorOf(e) });
      } finally {
        clearUrl();
      }
    })();
  }, [qr, code]);

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center bg-bg px-6 py-10 text-center">
      <div role="group" aria-label={t('timeclock.language')} className="absolute right-4 top-4 flex gap-1">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            aria-pressed={i18n.language === l}
            onClick={() => setLanguage(l)}
            className="min-h-10 rounded-control px-3 text-sm font-semibold uppercase text-muted aria-pressed:bg-surface-2 aria-pressed:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
          >
            {l}
          </button>
        ))}
      </div>

      {view.kind === 'busy' ? (
        <div className="flex flex-col items-center gap-4" role="status">
          <Spinner className="text-muted" />
          <p className="text-lg text-muted">{t(`timeclock.${view.label}`)}</p>
        </div>
      ) : null}

      {view.kind === 'idle' ? (
        <>
          <Clock aria-hidden size={56} className="text-gold" />
          <h1 className="mt-6 text-2xl font-semibold">{t('timeclock.title')}</h1>
          <p className="mt-3 max-w-xs text-muted">{t('timeclock.hint')}</p>
        </>
      ) : null}

      {view.kind === 'paired' ? (
        <>
          <Smartphone aria-hidden size={56} className="text-lime" />
          <p className="mt-6 text-muted">{t('timeclock.hello', { name: view.name })}</p>
          <h1 className="mt-1 text-2xl font-semibold">{t('timeclock.pairOk')}</h1>
          <p className="mt-3 max-w-xs text-muted">{t('timeclock.pairOkHint')}</p>
        </>
      ) : null}

      {view.kind === 'done' ? (
        <>
          {view.action === 'in' ? <LogIn aria-hidden size={64} className="text-lime" /> : null}
          {view.action === 'out' ? <LogOut aria-hidden size={64} className="text-gold" /> : null}
          {view.action === 'ignored' ? <CircleCheck aria-hidden size={64} className="text-muted" /> : null}
          <p className="mt-6 text-muted">{view.name}</p>
          <h1 className="mt-1 text-3xl font-semibold">{t(`timeclock.${view.action}`)}</h1>
          <p className="tabular mt-3 text-5xl font-semibold">{view.at.slice(11)}</p>
          {view.minutes != null ? (
            <p className="mt-4 text-lg text-muted">
              {t('timeclock.total', { h: Math.floor(view.minutes / 60), m: view.minutes % 60 })}
            </p>
          ) : null}
        </>
      ) : null}

      {view.kind === 'error' ? (
        <div role="alert" className="flex flex-col items-center">
          <CircleX aria-hidden size={56} className="text-danger-ink" />
          <h1 className="mt-6 text-2xl font-semibold">{t(ERROR_TEXT[view.error][0])}</h1>
          <p className="mt-3 max-w-xs text-muted">{t(ERROR_TEXT[view.error][1])}</p>
        </div>
      ) : null}
    </main>
  );
}

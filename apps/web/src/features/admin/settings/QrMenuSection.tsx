import { clsx } from 'clsx';
import { Copy, Download, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../../../lib/toast';
import { Button } from '../../../ui/Button';
import { Spinner } from '../../../ui/Spinner';
import { Section } from '../menu/fields';
import { downloadSvg, menuUrl, qrSvg10cm, svgDataUrl } from './qrMenu';

/**
 * Ayarlar > QR menü: müşteri menüsünün bağlantısı, QR önizlemesi ve baskı dosyası. Kayıt yok —
 * bağlantı bu sitenin adresinden türetilir, sayfadaki "Kaydet" ile ilgisi yoktur.
 */
export function QrMenuSection({ origin = window.location.origin }: { origin?: string }) {
  const { t } = useTranslation();
  const url = menuUrl(origin);
  const [result, setResult] = useState<{ url: string; svg: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    qrSvg10cm(url).then(
      (svg) => !cancelled && setResult({ url, svg }),
      () => !cancelled && setResult({ url, svg: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  const current = result?.url === url ? result : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('admin.settings.qrMenu.copied'));
    } catch {
      toast(t('admin.settings.qrMenu.copyError'), 'danger');
    }
  };

  return (
    <Section
      level={2}
      title={t('admin.settings.qrMenu.title')}
      description={t('admin.settings.qrMenu.description')}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div
          className={clsx(
            'flex size-40 shrink-0 items-center justify-center self-center rounded-card p-2 sm:self-start',
            current?.svg ? 'bg-white' : 'border border-border bg-surface-2',
          )}
        >
          {current?.svg ? (
            <img
              src={svgDataUrl(current.svg)}
              alt={t('admin.settings.qrMenu.previewAlt')}
              width={144}
              height={144}
              className="size-full"
            />
          ) : current ? (
            <p role="alert" className="text-center text-xs text-danger-ink">
              {t('admin.settings.qrMenu.error')}
            </p>
          ) : (
            <Spinner className="text-muted" label={t('common.loading')} />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted">{t('admin.settings.qrMenu.link')}</p>
            <p className="break-all rounded-control border border-border bg-surface-2 px-3 py-2 font-mono text-sm">
              {url}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={<Copy aria-hidden size={18} />}
              onClick={() => void copy()}
            >
              {t('admin.settings.qrMenu.copy')}
            </Button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-base font-semibold text-text hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              <ExternalLink aria-hidden size={18} className="shrink-0" />
              {t('admin.settings.qrMenu.open')}
            </a>
          </div>
          <Button
            variant="secondary"
            icon={<Download aria-hidden size={18} />}
            disabled={!current?.svg}
            onClick={() => current?.svg && downloadSvg(current.svg)}
            className="self-start"
          >
            {t('admin.settings.qrMenu.download')}
          </Button>
          <p className="text-xs text-muted">{t('admin.settings.qrMenu.downloadHint')}</p>
        </div>
      </div>
    </Section>
  );
}

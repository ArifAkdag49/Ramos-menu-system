import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../../../ui/Spinner';
import { svgDataUrl } from '../settings/qrMenu';
import { timeclockQrSvg } from './qrPrint';

/** QR önizlemesi: kendi ürettiğimiz SVG, `<img>` içinde (betik çalışmaz). */
export function QrImage({
  value,
  alt,
  size,
  onSvg,
}: {
  value: string;
  alt: string;
  size: number;
  /** Üretilen SVG (yazdırma/indirme için). */
  onSvg?: (svg: string | null) => void;
}) {
  const { t } = useTranslation();
  const [result, setResult] = useState<{ value: string; svg: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    timeclockQrSvg(value).then(
      (svg) => {
        if (cancelled) return;
        setResult({ value, svg });
        onSvg?.(svg);
      },
      () => {
        if (cancelled) return;
        setResult({ value, svg: null });
        onSvg?.(null);
      },
    );
    return () => {
      cancelled = true;
    };
    // `onSvg` satır içi kapanış olabilir; QR yalnız değer değişince yeniden üretilir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const current = result?.value === value ? result : null;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-card bg-white p-2"
      style={{ width: size, height: size }}
    >
      {current?.svg ? (
        <img src={svgDataUrl(current.svg)} alt={alt} className="size-full" />
      ) : current ? (
        <p role="alert" className="text-center text-xs text-danger-ink">
          {t('admin.timeclock.qrError')}
        </p>
      ) : (
        <Spinner className="text-muted" label={t('common.loading')} />
      )}
    </div>
  );
}

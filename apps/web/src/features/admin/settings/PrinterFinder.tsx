import { Check, Radar } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { FoundPrinter } from '../../../native/capacitor';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import {
  discoverPrinters,
  discoverySupport,
  primaryNetwork,
  type DiscoveryOutcome,
} from './printerDiscovery';

/**
 * Ayarlar > Yazıcı bağlantısı > "Ağdaki yazıcıyı bul". Yalnız yerel Android uygulamasında çizilir:
 * taramayı cihaz kendisi yapar (Wi-Fi ya da kablolu ağ), bulunanlardan biri seçilince üst form dolar
 * (`onPick` → `applyFoundPrinter`); kayıt yine sayfanın "Kaydet" düğmesiyle. Tarayıcıda (Chrome/PWA)
 * hiçbir şey çizilmez — bilgisayardaki kurulum sihirbazı (Kurulum.cmd) aynı işi orada yapar.
 */
export function PrinterFinder({
  currentHost,
  onPick,
}: {
  currentHost: string;
  onPick: (printer: FoundPrinter) => void;
}) {
  const { t } = useTranslation();
  const [support] = useState(discoverySupport);
  const [state, setState] = useState<
    { status: 'idle' } | { status: 'running' } | { status: 'done'; outcome: DiscoveryOutcome }
  >({ status: 'idle' });

  if (support === 'browser') return null;

  const running = state.status === 'running';
  const run = async () => {
    if (running) return;
    setState({ status: 'running' });
    const outcome = await discoverPrinters(currentHost);
    setState({ status: 'done', outcome });
  };

  return (
    <div className="flex flex-col gap-3 rounded-control border border-border p-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">{t('admin.settings.printer.find.title')}</p>
        <p className="text-xs text-muted">{t('admin.settings.printer.find.description')}</p>
      </div>
      {support === 'old_app' ? (
        <p role="note" className="text-sm text-warning">
          {t('admin.settings.printer.find.oldApp')}
        </p>
      ) : (
        <div>
          <Button
            variant="secondary"
            icon={<Radar aria-hidden size={18} />}
            loading={running}
            onClick={() => void run()}
          >
            {t(running ? 'admin.settings.printer.find.running' : 'admin.settings.printer.find.button')}
          </Button>
        </div>
      )}
      {state.status === 'done' ? (
        <Outcome t={t} outcome={state.outcome} currentHost={currentHost.trim()} onPick={onPick} />
      ) : null}
    </div>
  );
}

const KIND_KEY = {
  escpos: 'admin.settings.printer.find.kinds.escpos',
  epson_secure: 'admin.settings.printer.find.kinds.epson_secure',
  epson_epos: 'admin.settings.printer.find.kinds.epson_epos',
  open: 'admin.settings.printer.find.kinds.open',
} as const satisfies Record<FoundPrinter['kind'], string>;

function Outcome({
  t,
  outcome,
  currentHost,
  onPick,
}: {
  t: TFunction;
  outcome: DiscoveryOutcome;
  currentHost: string;
  onPick: (printer: FoundPrinter) => void;
}) {
  if (!outcome.ok) {
    const text =
      outcome.error === 'no_network'
        ? t('admin.settings.printer.find.noNetwork')
        : outcome.error === 'busy'
          ? t('admin.settings.printer.find.busy')
          : outcome.error === 'unsupported'
            ? t('admin.settings.printer.find.oldApp')
            : t('admin.settings.printer.find.failed', {
                detail: outcome.message?.trim() || outcome.error,
              });
    return (
      <p role="alert" className="break-words text-sm text-danger-ink">
        {text}
      </p>
    );
  }
  const net = primaryNetwork(outcome.networks);
  const network = net
    ? `${t(`admin.settings.printer.find.transport.${net.transport === 'ethernet' ? 'ethernet' : 'wifi'}`)} ${net.address}/${net.prefix}`
    : '—';
  if (outcome.printers.length === 0) {
    return (
      <p role="status" className="text-sm text-warning">
        {t('admin.settings.printer.find.none', { scanned: outcome.scanned, network })}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="text-sm text-muted">
        {t('admin.settings.printer.find.summary', {
          count: outcome.printers.length,
          scanned: outcome.scanned,
          network,
        })}
      </p>
      <ul className="flex flex-col gap-2">
        {outcome.printers.map((p) => (
          <li
            key={`${p.host}:${p.port}`}
            className="flex flex-col gap-2 rounded-control border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-mono text-sm font-medium">
                {p.host}:{p.port}
              </p>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <Badge tone={p.confirmed ? 'open' : 'warning'}>
                  {t(
                    p.confirmed
                      ? 'admin.settings.printer.find.confirmed'
                      : 'admin.settings.printer.find.unconfirmed',
                  )}
                </Badge>
                <span>{t(KIND_KEY[p.kind], { port: p.port })}</span>
                {p.host === currentHost ? (
                  <Badge tone="info">{t('admin.settings.printer.find.current')}</Badge>
                ) : null}
              </p>
              {!p.confirmed && p.message ? (
                <p className="break-all text-xs text-muted">{p.message}</p>
              ) : null}
            </div>
            <Button
              variant="secondary"
              icon={<Check aria-hidden size={18} />}
              onClick={() => onPick(p)}
              className="shrink-0"
            >
              {t('admin.settings.printer.find.use')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

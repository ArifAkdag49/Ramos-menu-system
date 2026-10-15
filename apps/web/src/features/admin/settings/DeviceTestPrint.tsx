import { CheckCircle2, Printer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../lib/auth';
import { nativePlugin } from '../../../native/capacitor';
import { Button } from '../../../ui/Button';
import {
  deviceTestPayload,
  deviceTestTarget,
  printDeviceTest,
  type DeviceTestError,
  type DeviceTestOutcome,
} from './deviceTestLogic';
import type { SettingsForm } from './settingsLogic';

const ERROR_KEY = {
  offline: 'admin.settings.printer.deviceTest.errors.offline',
  timeout: 'admin.settings.printer.deviceTest.errors.offline',
  io: 'admin.settings.printer.deviceTest.errors.io',
  cover_open: 'admin.settings.printer.deviceTest.errors.cover_open',
  paper_end: 'admin.settings.printer.deviceTest.errors.paper_end',
  encode: 'admin.settings.printer.deviceTest.errors.encode',
} as const satisfies Record<DeviceTestError, string>;

const TARGET_KEY = {
  host_missing: 'admin.settings.printer.deviceTest.hostMissing',
  host_invalid: 'admin.settings.errors.host_invalid',
  port_invalid: 'admin.settings.errors.port_invalid',
} as const;

/**
 * "Bu cihazdan test fişi bas" (`deviceTestLogic.ts`). Yalnız yazıcı eklentisi olan Android
 * uygulamasında çizilir; tarayıcıda ve iPhone'da hiçbir şey göstermez. Formdaki adresi kullanır —
 * kaydetmeden önce denemek tam olarak amaçtır — ve hiçbir şey kaydetmez.
 */
export function DeviceTestPrint({
  form,
}: {
  form: Pick<
    SettingsForm,
    | 'printer_host'
    | 'printer_port'
    | 'codepage'
    | 'printer_transliterate'
    | 'ticket_header'
    | 'ticket_footer'
  >;
}) {
  const { t } = useTranslation();
  const waiter = useAuth((s) => s.profile?.display_name ?? 'Admin');
  const [printer] = useState(() => nativePlugin('RamosPrinter'));
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<DeviceTestOutcome | null>(null);

  if (!printer) return null;

  const target = deviceTestTarget(form);

  const run = async () => {
    if (running || !target.ok) return;
    setRunning(true);
    setOutcome(null);
    const payload = deviceTestPayload(target.cfg, form, waiter, new Date());
    setOutcome(await printDeviceTest(printer, target.cfg, payload));
    setRunning(false);
  };

  return (
    <div className="flex flex-col gap-2 rounded-control border border-border p-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">{t('admin.settings.printer.deviceTest.title')}</p>
        <p className="text-xs text-muted">{t('admin.settings.printer.deviceTest.description')}</p>
      </div>
      <div>
        <Button
          variant="secondary"
          icon={<Printer aria-hidden size={18} />}
          loading={running}
          disabled={!target.ok || running}
          onClick={() => void run()}
        >
          {t('admin.settings.printer.deviceTest.button')}
        </Button>
      </div>
      {!target.ok ? <p className="text-xs text-muted">{t(TARGET_KEY[target.error])}</p> : null}
      {outcome?.ok ? (
        <p role="status" className="flex items-start gap-2 text-sm text-lime">
          <CheckCircle2 aria-hidden size={18} className="mt-0.5 shrink-0" />
          <span>{t('admin.settings.printer.deviceTest.sent', { target: outcome.target })}</span>
        </p>
      ) : null}
      {outcome && !outcome.ok ? (
        <p role="alert" className="break-words text-sm text-danger-ink">
          {t(ERROR_KEY[outcome.error], {
            target: outcome.target,
            detail: outcome.message?.trim() || outcome.error,
          })}
        </p>
      ) : null}
    </div>
  );
}

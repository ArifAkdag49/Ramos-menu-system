import { clsx } from 'clsx';
import { AlertTriangle, Check, Copy, KeyRound, Plus, Power, Printer } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useCreateSdpPrinter,
  useRotateSdpToken,
  useSdpPrinters,
  useSetSdpPrinterActive,
  type SdpPrinter,
  type SdpPrinterSecret,
} from '../../../data/sdpPrinters';
import { useSettings, useUpdateSettings } from '../../../data/settings';
import { useAuth } from '../../../lib/auth';
import { RpcError } from '../../../lib/rpc';
import { toast } from '../../../lib/toast';
import { Badge } from '../../../ui/Badge';
import { Banner } from '../../../ui/Banner';
import { Button } from '../../../ui/Button';
import type { Tone } from '../../../ui/tone';
import { agoParts, type AgoUnit } from '../dashboardLogic';
import { FIELD, Section } from '../menu/fields';
import { sdpConnection, sdpPrinterUrl, type PrintRoute } from './printRoute';

const AGO_KEY = {
  now: 'admin.ago.now',
  minutes: 'admin.ago.minutes',
  hours: 'admin.ago.hours',
  days: 'admin.ago.days',
} as const satisfies Record<AgoUnit, string>;

const CONNECTION = {
  online: { key: 'admin.settings.printRoute.online', tone: 'open' },
  offline: { key: 'admin.settings.printRoute.offline', tone: 'danger' },
  never: { key: 'admin.settings.printRoute.never', tone: 'empty' },
} as const satisfies Record<ReturnType<typeof sdpConnection>, { key: string; tone: Tone }>;

const GUIDE_STEPS = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6'] as const;
const NAME_MAX = 60;

/**
 * Ayarlar > Baskı yolu. Fişi kim basar: restorandaki bilgisayar programı (yazdırma ajanı) ya da
 * internete bağlı Epson yazıcının kendisi (Server Direct Print, `supabase/functions/epson-sdp`).
 *
 * Sayfanın "Kaydet" çubuğundan bağımsızdır: yol seçimi kendi "Uygula" düğmesiyle, yazıcı işlemleri
 * RPC'lerle hemen yazılır. Yazıcı adresi (anahtar içerir) yalnız oluşturma/yenileme yanıtında bilinir
 * ve BİR KEZ gösterilir; sunucuda yalnız özeti durur.
 */
export function PrintRouteSection({
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string,
}: {
  supabaseUrl?: string;
}) {
  const { t } = useTranslation();
  const row = useSettings();
  const updateSettings = useUpdateSettings();
  const meId = useAuth((s) => s.profile?.id ?? null);
  const printers = useSdpPrinters();
  const create = useCreateSdpPrinter();
  const rotate = useRotateSdpToken();
  const setActive = useSetSdpPrinterActive();
  const nameId = useId();
  const listId = useId();

  const saved = (row?.print_route ?? 'agent') as PrintRoute;
  const [choice, setChoice] = useState<PrintRoute | null>(null);
  const selected = choice ?? saved;
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<(SdpPrinterSecret & { name: string }) | null>(null);

  const list = printers.data ?? [];
  const hasActive = list.some((p) => p.is_active);
  const now = new Date();
  const errorToast = (e: unknown) =>
    toast(t(`errors.${e instanceof RpcError ? e.key : 'unknown'}`), 'danger');

  const applyRoute = () =>
    updateSettings.mutate(
      { print_route: selected, updated_by: meId },
      {
        onSuccess: () => {
          setChoice(null);
          toast(t('admin.settings.printRoute.applied'));
        },
        onError: () => toast(t('admin.settings.printRoute.applyError'), 'danger'),
      },
    );

  const trimmed = name.trim();
  const addPrinter = () => {
    if (!trimmed || create.isPending) return;
    create.mutate(trimmed, {
      onSuccess: (s) => setSecret({ ...s, name: trimmed }),
      onError: errorToast,
    });
  };

  const rotateToken = (p: SdpPrinter) => {
    if (!window.confirm(t('admin.settings.printRoute.confirmRotate', { name: p.name }))) return;
    rotate.mutate(p.id, { onSuccess: (s) => setSecret({ ...s, name: p.name }), onError: errorToast });
  };

  const closeSecret = () => {
    setSecret(null);
    setName('');
    // Anahtar mutasyon durumunda da bellekte kalmasın.
    create.reset();
    rotate.reset();
  };

  const secretUrl = secret ? sdpPrinterUrl(supabaseUrl, secret.token) : null;
  const copy = async () => {
    if (!secretUrl) return;
    try {
      await navigator.clipboard.writeText(secretUrl);
      toast(t('admin.settings.printRoute.copied'));
    } catch {
      toast(t('admin.settings.printRoute.copyError'), 'danger');
    }
  };

  return (
    <Section
      level={2}
      title={t('admin.settings.printRoute.title')}
      description={t('admin.settings.printRoute.description')}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-muted">
          {t('admin.settings.printRoute.routeLabel')}
        </legend>
        {(['agent', 'epson_sdp'] as const).map((route) => (
          <label
            key={route}
            className={clsx(
              'flex min-h-12 cursor-pointer items-start gap-3 rounded-control border px-3 py-2',
              selected === route ? 'border-lime' : 'border-border',
            )}
          >
            <input
              type="radio"
              name="print-route"
              value={route}
              checked={selected === route}
              onChange={() => setChoice(route === saved ? null : route)}
              className="mt-1 size-5 shrink-0 accent-lime"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">
                {t(route === 'agent' ? 'admin.settings.printRoute.agent' : 'admin.settings.printRoute.epson')}
              </span>
              <span className="text-xs text-muted">
                {t(route === 'agent' ? 'admin.settings.printRoute.agentHint' : 'admin.settings.printRoute.epsonHint')}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {choice ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="flex flex-1 items-start gap-2 text-warning">
            <AlertTriangle aria-hidden size={18} className="mt-0.5 shrink-0" />
            <span>{t('admin.settings.printRoute.pendingChange')}</span>
          </p>
          <Button onClick={applyRoute} loading={updateSettings.isPending} icon={<Check aria-hidden size={18} />}>
            {t('admin.settings.printRoute.apply')}
          </Button>
        </div>
      ) : null}

      {selected === 'epson_sdp' && !printers.isLoading && !hasActive ? (
        <Banner tone="danger" icon={<AlertTriangle aria-hidden size={20} />}>
          {t('admin.settings.printRoute.noActivePrinter')}
        </Banner>
      ) : null}
      {saved === 'epson_sdp' ? (
        <p role="note" className="text-sm text-muted">
          {t('admin.settings.printRoute.agentIdleNote')}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 id={listId} className="text-sm font-semibold">
          {t('admin.settings.printRoute.printers')}
        </h3>
        {list.length === 0 ? (
          <p className="rounded-control border border-dashed border-border px-4 py-4 text-center text-muted">
            {t('admin.settings.printRoute.empty')}
          </p>
        ) : (
          <ul aria-labelledby={listId} className="flex flex-col gap-2">
            {list.map((p) => {
              const conn = CONNECTION[sdpConnection(p.last_seen_at, now)];
              const parts = agoParts(p.last_seen_at, now);
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 rounded-control border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="flex items-center gap-2 font-medium">
                      <Printer aria-hidden size={16} className="shrink-0" />
                      <span className="break-words">{p.name}</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Badge tone={p.is_active ? 'open' : 'empty'}>
                        {t(p.is_active ? 'admin.settings.printRoute.active' : 'admin.settings.printRoute.inactive')}
                      </Badge>
                      <Badge tone={conn.tone}>{t(conn.key)}</Badge>
                      {parts ? (
                        <span>
                          {t('admin.settings.printRoute.lastSeen', {
                            ago: t(AGO_KEY[parts.unit], { count: parts.count }),
                          })}
                        </span>
                      ) : null}
                    </p>
                    {p.last_error ? (
                      <p className="break-all text-xs text-warning">
                        {t('admin.settings.printRoute.lastError', { error: p.last_error })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      icon={<KeyRound aria-hidden size={18} />}
                      disabled={rotate.isPending}
                      onClick={() => rotateToken(p)}
                    >
                      {t('admin.settings.printRoute.rotate')}
                    </Button>
                    <Button
                      variant="ghost"
                      icon={<Power aria-hidden size={18} />}
                      disabled={setActive.isPending}
                      onClick={() =>
                        setActive.mutate({ id: p.id, active: !p.is_active }, { onError: errorToast })
                      }
                    >
                      {t(p.is_active ? 'admin.settings.printRoute.deactivate' : 'admin.settings.printRoute.activate')}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {secret && secretUrl ? (
        <div className="flex flex-col gap-3 rounded-card border border-warning p-3">
          <p className="text-sm font-semibold">{t('admin.settings.printRoute.secretTitle', { name: secret.name })}</p>
          <Banner tone="warning" icon={<AlertTriangle aria-hidden size={20} />}>
            {t('admin.settings.printRoute.secretWarning')}
          </Banner>
          <p className="break-all rounded-control border border-border bg-surface-2 px-3 py-2 font-mono text-sm">
            {secretUrl}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<Copy aria-hidden size={18} />} onClick={() => void copy()}>
              {t('admin.settings.printRoute.copy')}
            </Button>
            <Button onClick={closeSecret} icon={<Check aria-hidden size={18} />}>
              {t('admin.settings.printRoute.done')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-xs font-medium text-muted">
            {t('admin.settings.printRoute.name')}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={nameId}
              value={name}
              maxLength={NAME_MAX}
              placeholder={t('admin.settings.printRoute.namePlaceholder')}
              onChange={(e) => setName(e.target.value)}
              // Bölüm sayfanın ayar formunun içinde: Enter formu (ayarları) göndermesin, yazıcı eklesin.
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addPrinter();
                }
              }}
              className={FIELD}
            />
            <Button
              variant="secondary"
              icon={<Plus aria-hidden size={18} />}
              disabled={!trimmed}
              loading={create.isPending}
              onClick={addPrinter}
              className="shrink-0"
            >
              {t('admin.settings.printRoute.add')}
            </Button>
          </div>
        </div>
      )}

      <details className="rounded-control border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">{t('admin.settings.printRoute.guideTitle')}</summary>
        <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted">
          {GUIDE_STEPS.map((s) => (
            <li key={s}>{t(`admin.settings.printRoute.guide.${s}`)}</li>
          ))}
        </ol>
      </details>
    </Section>
  );
}

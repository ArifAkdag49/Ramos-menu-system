import { formatOrderNo } from '@ramos/shared';
import { AlertTriangle, Printer, Receipt, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRetryJob } from '../../data/orders';
import {
  completeStuckSeconds,
  usePrinterStatus,
  useTestPrint,
  type FailedJob,
  type PrinterProblem,
} from '../../data/printer';
import { RpcError } from '../../lib/rpc';
import { toast } from '../../lib/toast';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import type { Tone } from '../../ui/tone';
import { agoParts, type AgoUnit } from './dashboardLogic';

/** Sorun → renk. "Sessiz fiş kaybı" (R79) kağıt/kapak gibi görünür bir engelden daha ciddidir. */
const TONE: Record<Exclude<PrinterProblem, null>, Tone> = {
  agent_offline: 'danger',
  printer_unreachable: 'danger',
  paper_end: 'warning',
  cover_open: 'warning',
  complete_stuck: 'danger',
  jobs_failed: 'warning',
};

const STATE_KEY = {
  agent_offline: 'admin.printer.state.agent_offline',
  printer_unreachable: 'admin.printer.state.printer_unreachable',
  paper_end: 'admin.printer.state.paper_end',
  cover_open: 'admin.printer.state.cover_open',
  complete_stuck: 'admin.printer.state.complete_stuck',
  jobs_failed: 'admin.printer.state.jobs_failed',
} as const;

const HELP_KEY = {
  agent_offline: 'admin.printer.help.agent_offline',
  printer_unreachable: 'admin.printer.help.printer_unreachable',
  paper_end: 'admin.printer.help.paper_end',
  cover_open: 'admin.printer.help.cover_open',
  complete_stuck: 'admin.printer.help.complete_stuck',
  jobs_failed: 'admin.printer.help.jobs_failed',
} as const;

const AGO_KEY = {
  now: 'admin.ago.now',
  minutes: 'admin.ago.minutes',
  hours: 'admin.ago.hours',
  days: 'admin.ago.days',
} as const;

const JOB_TYPE_KEY = {
  order: 'admin.printer.jobType.order',
  addition: 'admin.printer.jobType.addition',
  storno: 'admin.printer.jobType.storno',
  table_move: 'admin.printer.jobType.table_move',
  reprint: 'admin.printer.jobType.reprint',
  test: 'admin.printer.jobType.test',
} as const;

/**
 * Yazıcı ajanı kartı (spec §8.4): ajan sinyali, yazıcı durumu, son baskı, basılamayan işler ve
 * tek ana eylem olan "Test fişi bas".
 *
 * R79 — `printer_status.last_error` ilk kez burada operatöre görünür oluyor. Ajan bir baskının
 * onayını 60 sn'den uzun süre tamamlayamazsa alanı `complete_stuck_<sn>s` ile işaretliyordu ama
 * arayüzde bu alanı okuyan hiçbir yer yoktu: uyarı veri tabanında duruyor, kimse görmüyordu.
 * Ham hata metni ekrana basılmaz (operatöre bir şey anlatmaz); süre ve "ne yapılmalı" yazılır.
 */
export function PrinterCard() {
  const { t } = useTranslation();
  const { status, problem, failedJobs } = usePrinterStatus();
  const testPrint = useTestPrint();
  const now = new Date();

  const ago = (iso: string | null | undefined): string | null => {
    const parts = agoParts(iso, now);
    return parts ? t(AGO_KEY[parts.unit as AgoUnit], { count: parts.count }) : null;
  };

  // M6 kapısı (H2): durum daha gelmediyse YEŞİL "Çevrimiçi" göstermek yalan söylemektir — yazıcı
  // o anda çevrimdışı olabilir. Bilgi yokken rozet nötr (gri) "Durum bilinmiyor" olur; yeşil
  // yalnızca gerçekten bir durum satırı okunduğunda ve sorun bulunmadığında çıkar.
  const known = !!status;
  const tone: Tone = known ? (problem ? TONE[problem] : 'open') : 'empty';
  const stateLabel = known
    ? problem
      ? t(STATE_KEY[problem])
      : t('admin.printer.state.online')
    : t('admin.printer.state.unknown');
  const stuckSeconds = completeStuckSeconds(status?.last_error);
  const lastPrintAgo = ago(status?.last_printed_at);
  const lastSeenAgo = ago(status?.last_seen_at);

  const runTestPrint = () =>
    testPrint.mutate(undefined, {
      onSuccess: () => toast(t('admin.printer.testPrintSent'), 'info'),
      onError: (e) => toast(t(`errors.${e instanceof RpcError ? e.key : 'unknown'}`), 'danger'),
    });

  return (
    <section
      aria-labelledby="printer-card-title"
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="printer-card-title" className="flex items-center gap-2 text-base font-semibold">
          <Printer aria-hidden size={18} />
          {t('admin.printer.title')}
        </h2>
        <span data-testid="printer-state" data-tone={tone}>
          <Badge tone={tone}>{stateLabel}</Badge>
        </span>
      </div>

      {status ? (
        <div className="flex flex-col gap-1 text-muted">
          <p>{lastPrintAgo ? t('admin.printer.lastPrint', { ago: lastPrintAgo }) : t('admin.printer.lastPrintNever')}</p>
          <p>{lastSeenAgo ? t('admin.printer.lastSeen', { ago: lastSeenAgo }) : t('admin.printer.lastSeenNever')}</p>
          {status.host ? <p>{t('admin.printer.host', { host: status.host })}</p> : null}
        </div>
      ) : (
        <p className="text-muted">{t('admin.printer.unknown')}</p>
      )}

      {problem ? <p className="text-text">{t(HELP_KEY[problem])}</p> : null}

      {stuckSeconds !== null ? (
        <p
          data-testid="printer-stuck"
          role="alert"
          className="flex items-start gap-2 rounded-card border border-danger/40 bg-danger/15 px-3 py-2 text-danger-ink"
        >
          <AlertTriangle aria-hidden size={18} className="mt-0.5 shrink-0" />
          <span>
            {t('admin.printer.stuckFor', { seconds: stuckSeconds })} — {t('admin.printer.help.complete_stuck')}
          </span>
        </p>
      ) : null}

      {failedJobs.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-muted">{t('admin.printer.failedTitle')}</h3>
          <ul className="flex flex-col gap-2">
            {failedJobs.map((job) => (
              <FailedJobRow key={job.id} job={job} ago={ago(job.created_at)} />
            ))}
          </ul>
        </div>
      ) : null}

      <Button
        variant="secondary"
        icon={<Receipt aria-hidden size={18} />}
        loading={testPrint.isPending}
        onClick={runTestPrint}
      >
        {t('admin.printer.testPrint')}
      </Button>
    </section>
  );
}

function FailedJobRow({ job, ago }: { job: FailedJob; ago: string | null }) {
  const { t } = useTranslation();
  const retry = useRetryJob();

  const onRetry = () =>
    retry.mutate(job.id, {
      onSuccess: () => toast(t('admin.printer.retried'), 'info'),
      onError: (e) => toast(t(`errors.${e instanceof RpcError ? e.key : 'unknown'}`), 'danger'),
    });

  // M6 kapısı (H1): bilgi ve eylem yan yana durunca dar admin sütununda Almanca metin
  // ("Nachbestellung · gerade eben" + "Nochmal versuchen") düğmenin altına giriyordu. Alt alta
  // dizilim hem tam genişlik veriyor hem de kırpma/örtüşme bırakmıyor.
  return (
    <li className="flex flex-col gap-2 rounded-control border border-border bg-surface-2 px-3 py-2">
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="tabular font-semibold">{job.order_no !== null ? formatOrderNo(job.order_no) : '—'}</span>
        <span className="text-muted">
          {t(JOB_TYPE_KEY[job.type])}
          {ago ? ` · ${ago}` : ''}
        </span>
      </span>
      <Button
        variant="ghost"
        icon={<RotateCw aria-hidden size={18} />}
        loading={retry.isPending}
        onClick={onRetry}
        className="self-start px-2"
      >
        {t('common.retry')}
      </Button>
    </li>
  );
}

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import type { FailedJob, PrinterProblem, PrinterStatusValue } from '../../data/printer';
import { useToast } from '../../lib/toast';

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

const status = (over: Partial<PrinterStatusValue> = {}): PrinterStatusValue => ({
  last_seen_at: minutesAgo(0),
  printer_reachable: true,
  printer_state: {},
  last_error: null,
  last_printed_at: minutesAgo(2),
  agent_id: 'pc-restaurant',
  agent_version: '1.0.0',
  host: '192.168.1.50',
  ...over,
});

const view: { status: PrinterStatusValue | undefined; problem: PrinterProblem; failedJobs: FailedJob[] } = {
  status: status(),
  problem: null,
  failedJobs: [],
};

const testPrint = { mutate: vi.fn(), isPending: false };
const retryJob = { mutate: vi.fn(), isPending: false };

vi.mock('../../data/printer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/printer')>()),
  usePrinterStatus: () => view,
  useTestPrint: () => testPrint,
}));
vi.mock('../../data/orders', () => ({ useRetryJob: () => retryJob }));

import { PrinterCard } from './PrinterCard';

const state = () => screen.getByTestId('printer-state');

beforeEach(() => {
  view.status = status();
  view.problem = null;
  view.failedJobs = [];
  testPrint.mutate = vi.fn();
  retryJob.mutate = vi.fn();
  useToast.getState().dismiss();
});

describe('<PrinterCard />', () => {
  it('(a) sorun yokken yeşil "Çevrimiçi" ve son baskı zamanı', () => {
    render(<PrinterCard />);
    expect(state()).toHaveAttribute('data-tone', 'open');
    expect(state()).toHaveTextContent('Çevrimiçi');
    expect(screen.getByText('Son baskı: 2 dk önce')).toBeInTheDocument();
  });

  it('(b) ajan çevrimdışıyken kırmızı durum ve yardım metni', () => {
    view.problem = 'agent_offline';
    view.status = status({ last_seen_at: minutesAgo(12) });
    render(<PrinterCard />);
    expect(state()).toHaveAttribute('data-tone', 'danger');
    expect(state()).toHaveTextContent('Yazdırma ajanı çevrimdışı');
    expect(screen.getByText(/Restoran PC'si açık mı/)).toBeInTheDocument();
  });

  it('(c) kağıt bitince turuncu "Kağıt bitti"', () => {
    view.problem = 'paper_end';
    view.status = status({ printer_state: { paper_end: true } });
    render(<PrinterCard />);
    expect(state()).toHaveAttribute('data-tone', 'warning');
    expect(state()).toHaveTextContent('Kağıt bitti');
  });

  it('(d) başarısız işler listelenir, "Tekrar dene" o işi yeniden sıraya alır', async () => {
    view.problem = 'jobs_failed';
    view.failedJobs = [{ id: 'job-1', type: 'order', created_at: minutesAgo(5), order_no: 47 }];
    retryJob.mutate = vi.fn((_id: string, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    render(<PrinterCard />);

    expect(screen.getByText('#047')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(retryJob.mutate).toHaveBeenCalledWith('job-1', expect.anything());
    expect(useToast.getState().message).toBe('Tekrar sıraya alındı');
  });

  it('"Test fişi bas" işi sıraya alır ve onay gösterir', async () => {
    testPrint.mutate = vi.fn((_v: undefined, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    render(<PrinterCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Test fişi bas' }));
    expect(testPrint.mutate).toHaveBeenCalled();
    expect(useToast.getState().message).toBe('Test fişi sıraya alındı');
  });

  it('R79: onay takıldığında uyarı, süre ve ne yapılacağı görünür', () => {
    view.problem = 'complete_stuck';
    view.status = status({ last_error: 'complete_stuck_75s;ECONNRESET' });
    render(<PrinterCard />);
    expect(state()).toHaveAttribute('data-tone', 'danger');
    expect(state()).toHaveTextContent('Yazdırma onayı takıldı');
    const warning = screen.getByTestId('printer-stuck');
    expect(warning).toHaveTextContent('75');
    expect(warning).toHaveTextContent(/mutfaktaki fişi kontrol et/i);
  });

  it('M6 (H2): durum henüz gelmediyse yeşil "Çevrimiçi" DEĞİL, nötr "Durum bilinmiyor" gösterilir', () => {
    view.status = undefined;
    view.problem = null;
    render(<PrinterCard />);
    expect(state()).toHaveAttribute('data-tone', 'empty');
    expect(state()).toHaveTextContent('Durum bilinmiyor');
    expect(screen.queryByText('Çevrimiçi')).not.toBeInTheDocument();
  });

  it('R79: ham hata metni operatöre gösterilmez', () => {
    view.problem = 'complete_stuck';
    view.status = status({ last_error: 'complete_stuck_75s;ECONNRESET' });
    render(<PrinterCard />);
    expect(screen.queryByText(/ECONNRESET/)).not.toBeInTheDocument();
  });
});

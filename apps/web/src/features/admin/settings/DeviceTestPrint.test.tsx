import { renderTicket } from '@ramos/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import type { RamosPrinterSendOptions, RamosPrinterSendResult } from '../../../native/capacitor';
import { DeviceTestPrint } from './DeviceTestPrint';
import { deviceTestPayload, deviceTestTarget, printDeviceTest } from './deviceTestLogic';

type W = Window & { Capacitor?: unknown };

function mockNative(send: (o: RamosPrinterSendOptions) => Promise<RamosPrinterSendResult>) {
  (window as W).Capacitor = {
    isNativePlatform: () => true,
    Plugins: { RamosPrinter: { send, status: vi.fn() } },
  };
}

afterEach(() => {
  delete (window as W).Capacitor;
});

const form = {
  printer_host: ' 192.168.1.250 ',
  printer_port: '9100',
  codepage: 'cp857/61',
  printer_transliterate: false,
  ticket_header: "RAMO'S",
  ticket_footer: '',
};

describe('deviceTestTarget', () => {
  it('formdaki (kaydedilmemiş) adres, port ve karakter tablosu kullanılır', () =>
    expect(deviceTestTarget(form)).toEqual({
      ok: true,
      cfg: {
        host: '192.168.1.250',
        port: 9100,
        codepage: 'cp857',
        codepageNumber: 61,
        transliterate: false,
      },
    }));

  it('boş / hatalı adres ve port basılmaz', () => {
    expect(deviceTestTarget({ ...form, printer_host: ' ' })).toEqual({
      ok: false,
      error: 'host_missing',
    });
    expect(deviceTestTarget({ ...form, printer_host: '192.168.1' })).toEqual({
      ok: false,
      error: 'host_invalid',
    });
    expect(deviceTestTarget({ ...form, printer_port: '70000' })).toEqual({
      ok: false,
      error: 'port_invalid',
    });
  });
});

describe('deviceTestPayload', () => {
  it('test fişi olarak çizilir, gönderildiği adresi yazar', () => {
    const target = deviceTestTarget(form);
    if (!target.ok) throw new Error('hedef yok');
    const payload = deviceTestPayload(target.cfg, form, 'Ramo', new Date('2026-10-15T08:00:00Z'));
    const text = renderTicket(payload)
      .map((l) => (l.kind === 'text' ? l.text : ''))
      .join('\n');
    expect(text).toContain('TESTDRUCK');
    expect(text).toContain('Drucker: 192.168.1.250:9100');
  });
});

describe('printDeviceTest', () => {
  it('eklentiye formdaki adresle, durum okumalı gönderir', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const target = deviceTestTarget(form);
    if (!target.ok) throw new Error('hedef yok');
    const res = await printDeviceTest(
      { send, status: vi.fn() },
      target.cfg,
      deviceTestPayload(target.cfg, form, 'Ramo', new Date()),
    );
    expect(res).toEqual({ ok: true, target: '192.168.1.250:9100' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ host: '192.168.1.250', port: 9100, checkStatus: true }),
    );
  });

  it('eklenti reddederse fırlatmaz, io hatası döner', async () => {
    const target = deviceTestTarget(form);
    if (!target.ok) throw new Error('hedef yok');
    const res = await printDeviceTest(
      { send: vi.fn().mockRejectedValue(new Error('boom')), status: vi.fn() },
      target.cfg,
      deviceTestPayload(target.cfg, form, 'Ramo', new Date()),
    );
    expect(res).toEqual({ ok: false, target: '192.168.1.250:9100', error: 'io', message: 'boom' });
  });
});

describe('<DeviceTestPrint />', () => {
  it('tarayıcıda (eklenti yok) hiçbir şey çizmez', () => {
    const { container } = render(<DeviceTestPrint form={form} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uygulamada basar ve hangi adrese gittiğini söyler', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    mockNative(send);
    render(<DeviceTestPrint form={form} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bu cihazdan test fişi bas' }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent('192.168.1.250:9100');
  });

  it('ulaşılamayınca sebebi ve aynı ağ ipucunu gösterir', async () => {
    mockNative(vi.fn().mockResolvedValue({ ok: false, error: 'offline', message: 'ECONNREFUSED' }));
    render(<DeviceTestPrint form={form} />);

    await userEvent.click(screen.getByRole('button', { name: 'Bu cihazdan test fişi bas' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('aynı ağda mı');
    expect(alert).toHaveTextContent('ECONNREFUSED');
  });

  it('adres yoksa düğme pasif, nedeni yazılı', () => {
    mockNative(vi.fn());
    render(<DeviceTestPrint form={{ ...form, printer_host: '' }} />);
    expect(screen.getByRole('button', { name: 'Bu cihazdan test fişi bas' })).toBeDisabled();
    expect(screen.getByText(/Önce yazıcı adresini gir/)).toBeInTheDocument();
  });
});

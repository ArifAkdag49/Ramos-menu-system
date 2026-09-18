import { Tablet, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useRevokeStationDevice,
  useStationDevices,
  type StationDevice,
} from '../../../data/stationDevices';
import { RpcError } from '../../../lib/rpc';
import { toast } from '../../../lib/toast';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import type { Tone } from '../../../ui/tone';
import { agoParts, type AgoUnit } from '../dashboardLogic';
import { sdpConnection } from './printRoute';

const AGO_KEY = {
  now: 'admin.ago.now',
  minutes: 'admin.ago.minutes',
  hours: 'admin.ago.hours',
  days: 'admin.ago.days',
} as const satisfies Record<AgoUnit, string>;

// Hizmet ~1 sn'de bir yoklar, sunucu son görülmeyi 5 sn'de bir yazar: SDP ile aynı 90 sn eşiği uyar.
const CONNECTION = {
  online: { key: 'admin.settings.printRoute.online', tone: 'open' },
  offline: { key: 'admin.settings.printRoute.offline', tone: 'danger' },
  never: { key: 'admin.settings.printRoute.never', tone: 'empty' },
} as const satisfies Record<ReturnType<typeof sdpConnection>, { key: string; tone: Tone }>;

/**
 * Ayarlar > Baskı yolu > Tablet yazıcı istasyonu: arka planda basan tabletler (`station_devices`).
 * Kayıt tabletin Mutfak ekranındaki anahtarla oluşur; burada yalnız izlenir ve kaldırılır (anahtar
 * anında geçersiz olur, elindeki iş kuyruğa döner).
 */
export function StationDevicesList() {
  const { t } = useTranslation();
  const devices = useStationDevices();
  const revoke = useRevokeStationDevice();
  const listId = useId();
  const list = devices.data ?? [];
  const now = new Date();

  const ago = (iso: string | null) => {
    const parts = agoParts(iso, now);
    return parts ? t(AGO_KEY[parts.unit], { count: parts.count }) : null;
  };

  const remove = (d: StationDevice) => {
    if (!window.confirm(t('admin.settings.printRoute.confirmRemoveDevice', { name: d.name })))
      return;
    revoke.mutate(d.id, {
      onSuccess: () => toast(t('admin.settings.printRoute.deviceRemoved')),
      onError: (e) => toast(t(`errors.${e instanceof RpcError ? e.key : 'unknown'}`), 'danger'),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 id={listId} className="text-sm font-semibold">
        {t('admin.settings.printRoute.devices')}
      </h3>
      {list.length === 0 ? (
        devices.isLoading ? null : (
          <p className="rounded-control border border-dashed border-border px-4 py-4 text-center text-sm text-muted">
            {t('admin.settings.printRoute.devicesEmpty')}
          </p>
        )
      ) : (
        <ul aria-labelledby={listId} className="flex flex-col gap-2">
          {list.map((d) => {
            const conn = CONNECTION[sdpConnection(d.last_seen_at, now)];
            const seen = ago(d.last_seen_at);
            const printed = ago(d.last_printed_at);
            return (
              <li
                key={d.id}
                className="flex flex-col gap-2 rounded-control border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex items-center gap-2 font-medium">
                    <Tablet aria-hidden size={16} className="shrink-0" />
                    <span className="min-w-0 break-words">{d.name}</span>
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <Badge tone={conn.tone}>{t(conn.key)}</Badge>
                    {seen ? (
                      <span>{t('admin.settings.printRoute.lastSeen', { ago: seen })}</span>
                    ) : null}
                    <span>
                      {printed
                        ? t('admin.settings.printRoute.deviceLastPrint', { ago: printed })
                        : t('admin.settings.printRoute.deviceNoPrint')}
                    </span>
                  </p>
                  {d.last_error ? (
                    <p className="break-all text-xs text-warning">
                      {t('admin.settings.printRoute.lastError', { error: d.last_error })}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  icon={<Trash2 aria-hidden size={18} />}
                  disabled={revoke.isPending}
                  onClick={() => remove(d)}
                  className="self-start sm:self-auto"
                >
                  {t('admin.settings.printRoute.removeDevice')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

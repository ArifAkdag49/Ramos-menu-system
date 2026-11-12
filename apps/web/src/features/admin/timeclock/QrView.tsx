import { Download, MapPin, Printer, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../../data/settings';
import { toast } from '../../../lib/toast';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { errorKey } from '../../waiter/submitError';
import { Section, TextField, Toggle } from '../menu/fields';
import { downloadSvg } from '../settings/qrMenu';
import { QrImage } from './QrImage';
import { printTimeclockQr, TIMECLOCK_QR_FILE } from './qrPrint';
import { useRotateQr, useSaveTimeclockSettings } from './timeclockApi';
import { parseRadius, scanUrl, type TimeclockSettings } from './timeclockLogic';

export function QrView({ settings }: { settings: TimeclockSettings }) {
  const { t } = useTranslation();
  const restaurant = useSettings()?.restaurant_name ?? "Ramo's";
  const url = scanUrl(window.location.origin, settings.qr_token);
  const save = useSaveTimeclockSettings();
  const rotate = useRotateQr();
  const [svg, setSvg] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [radius, setRadius] = useState(String(settings.radius_m));
  const [radiusError, setRadiusError] = useState(false);
  const [locating, setLocating] = useState(false);

  const run = async (patch: Parameters<typeof save.mutateAsync>[0]) => {
    try {
      await save.mutateAsync(patch);
      toast(t('admin.timeclock.saved'), 'ready');
    } catch (e) {
      toast(t(`errors.${errorKey(e)}`), 'danger');
    }
  };

  const saveHere = () => {
    if (!navigator.geolocation) {
      toast(t('admin.timeclock.locReadFailed'), 'danger');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        void run({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        setLocating(false);
        toast(t('admin.timeclock.locReadFailed'), 'danger');
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const print = () => {
    if (!svg) return;
    printTimeclockQr(svg, {
      brand: restaurant,
      title: t('admin.timeclock.printTitle'),
      hint: t('admin.timeclock.printHint'),
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section level={2} title={t('admin.timeclock.qrTitle')} description={t('admin.timeclock.qrHint')}>
        <div className="flex flex-col items-center gap-4">
          <QrImage value={url} alt={t('admin.timeclock.qrAlt')} size={240} onSvg={setSvg} />
          <div className="flex flex-wrap justify-center gap-2">
            <Button icon={<Printer aria-hidden size={18} />} disabled={!svg} onClick={print}>
              {t('admin.timeclock.print')}
            </Button>
            <Button
              variant="secondary"
              icon={<Download aria-hidden size={18} />}
              disabled={!svg}
              onClick={() => svg && downloadSvg(svg, TIMECLOCK_QR_FILE)}
            >
              {t('admin.timeclock.download')}
            </Button>
            <Button variant="ghost" icon={<RefreshCw aria-hidden size={18} />} onClick={() => setConfirmRotate(true)}>
              {t('admin.timeclock.rotate')}
            </Button>
          </div>
        </div>
      </Section>

      <Section level={2} title={t('admin.timeclock.locTitle')} description={t('admin.timeclock.locHint')}>
        <Toggle
          label={t('admin.timeclock.locOn')}
          checked={settings.location_check}
          disabled={save.isPending}
          onChange={(v) => void run({ location_check: v })}
        />
        <p className={settings.has_location ? 'text-sm text-lime' : 'text-sm text-warning'}>
          {settings.has_location ? t('admin.timeclock.locSaved') : t('admin.timeclock.locMissing')}
        </p>
        <div>
          <Button variant="secondary" icon={<MapPin aria-hidden size={18} />} loading={locating} onClick={saveHere}>
            {t('admin.timeclock.locSet')}
          </Button>
        </div>
        <form
          className="flex items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const r = parseRadius(radius);
            setRadiusError(r === null);
            if (r !== null) void run({ radius_m: r });
          }}
        >
          <div className="w-40">
            <TextField
              type="number"
              inputMode="numeric"
              label={t('admin.timeclock.radius')}
              value={radius}
              error={radiusError ? t('admin.timeclock.radiusInvalid') : null}
              onChange={setRadius}
            />
          </div>
          <Button type="submit" variant="secondary" loading={save.isPending} className="mt-6">
            {t('common.save')}
          </Button>
        </form>
      </Section>

      {confirmRotate ? (
        <Sheet
          open
          onClose={() => setConfirmRotate(false)}
          title={t('admin.timeclock.rotateTitle')}
          closeLabel={t('common.close')}
          busy={rotate.isPending}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={rotate.isPending} onClick={() => setConfirmRotate(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                loading={rotate.isPending}
                onClick={() =>
                  void rotate.mutateAsync(undefined).then(
                    () => {
                      setConfirmRotate(false);
                      toast(t('admin.timeclock.rotated'), 'ready');
                    },
                    (e: unknown) => toast(t(`errors.${errorKey(e)}`), 'danger'),
                  )
                }
              >
                {t('admin.timeclock.rotate')}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-muted">{t('admin.timeclock.rotateMsg')}</p>
        </Sheet>
      ) : null}
    </div>
  );
}

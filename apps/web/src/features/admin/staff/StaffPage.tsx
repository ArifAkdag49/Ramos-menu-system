import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  CircleOff,
  FlaskConical,
  KeyRound,
  Pencil,
  Plus,
  Timer,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { qk } from '../../../data/keys';
import { useBusinessDayStart } from '../../../data/settings';
import { useAdminStaffList } from '../../../data/staff';
import { useAuth, type Profile } from '../../../lib/auth';
import { toast } from '../../../lib/toast';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { Spinner } from '../../../ui/Spinner';
import { SelectField, TextField } from '../menu/fields';
import { AdminStaffError, callAdminStaff } from './adminStaffClient';
import { isOnDuty, isTestAccount } from './staffLogic';

type StaffRole = 'admin' | 'waiter' | 'kitchen';
type Locale = 'tr' | 'de';

/**
 * Personel: liste, yeni personel, düzenleme, PIN sıfırlama, aktif/pasif. Yazma yolu `admin-staff`
 * fonksiyonudur (auth kullanıcısı + profil birlikte değişir; istemci `profiles`'a yazamaz).
 */
export function StaffPage() {
  const { t } = useTranslation();
  const { data, isPending } = useAdminStaffList();
  const queryClient = useQueryClient();
  const meId = useAuth((s) => s.profile?.id);
  const dayStart = useBusinessDayStart();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [pinTarget, setPinTarget] = useState<Profile | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // `staff` ön eki: admin listesi ve garson/KDS'nin ad haritası birlikte tazelenir.
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.staff });
  const now = new Date();

  const setActive = async (p: Profile, active: boolean) => {
    if (!active && !window.confirm(t('admin.staff.confirmDeactivate', { name: p.display_name })))
      return;
    setBusyId(p.id);
    try {
      await callAdminStaff({ action: 'set_active', user_id: p.id, active });
      toast(t('admin.staff.updated'), 'ready');
      await refresh();
    } catch (e) {
      toast(errorText(t, e), 'danger');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('admin.staff.title')}</h1>
        <Button icon={<Plus aria-hidden size={20} />} onClick={() => setCreateOpen(true)}>
          {t('admin.staff.add')}
        </Button>
      </div>

      {isPending ? (
        <p className="flex items-center justify-center gap-2 px-4 py-10 text-muted">
          <Spinner label={t('common.loading')} />
          <span>{t('common.loading')}</span>
        </p>
      ) : !data?.length ? (
        <p className="px-4 py-10 text-center text-muted">{t('admin.staff.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((p) => {
            const onDuty = p.is_active && isOnDuty(p.on_duty_since, now, dayStart);
            return (
              <li
                key={p.id}
                className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 lg:flex-row lg:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 break-words text-base font-semibold">
                      {p.display_name}
                    </span>
                    {p.id === meId ? (
                      <span className="text-xs text-muted">({t('admin.staff.you')})</span>
                    ) : null}
                  </p>
                  <p className="break-words text-muted">
                    @{p.username} · {t(`roles.${p.role}`)} · {p.locale.toUpperCase()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isTestAccount(p.username) ? (
                    <Badge tone="warning" icon={<FlaskConical aria-hidden size={14} />}>
                      {t('admin.staff.testAccount')}
                    </Badge>
                  ) : null}
                  {onDuty ? (
                    <Badge tone="info" icon={<Timer aria-hidden size={14} />}>
                      {t('admin.staff.onDuty')}
                    </Badge>
                  ) : null}
                  {p.is_active ? (
                    <Badge tone="open" icon={<CheckCircle2 aria-hidden size={14} />}>
                      {t('admin.staff.active')}
                    </Badge>
                  ) : (
                    <Badge tone="empty" icon={<CircleOff aria-hidden size={14} />}>
                      {t('admin.staff.inactive')}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    icon={<Pencil aria-hidden size={18} />}
                    onClick={() => setEditTarget(p)}
                  >
                    {t('common.edit')}
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<KeyRound aria-hidden size={18} />}
                    onClick={() => setPinTarget(p)}
                  >
                    {t('admin.staff.resetPin')}
                  </Button>
                  {p.is_active ? (
                    <Button
                      variant="ghost"
                      icon={<UserX aria-hidden size={18} />}
                      loading={busyId === p.id}
                      disabled={p.id === meId}
                      onClick={() => void setActive(p, false)}
                    >
                      {t('admin.staff.deactivate')}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      icon={<UserCheck aria-hidden size={18} />}
                      loading={busyId === p.id}
                      onClick={() => void setActive(p, true)}
                    >
                      {t('admin.staff.activate')}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {createOpen ? (
        <CreateStaffSheet onClose={() => setCreateOpen(false)} onDone={refresh} />
      ) : null}
      {editTarget ? (
        <EditStaffSheet
          target={editTarget}
          isSelf={editTarget.id === meId}
          onClose={() => setEditTarget(null)}
          onDone={refresh}
        />
      ) : null}
      {pinTarget ? <ResetPinSheet target={pinTarget} onClose={() => setPinTarget(null)} /> : null}
    </div>
  );
}

type TFn = ReturnType<typeof useTranslation>['t'];

function errorText(t: TFn, e: unknown): string {
  const key = e instanceof AdminStaffError ? e.key : 'unknown';
  return t(`admin.staff.errors.${key}` as 'admin.staff.errors.unknown', {
    defaultValue: t('admin.staff.errors.unknown'),
  });
}

function SheetFooter({
  error,
  saving,
  onSave,
}: {
  error: string | null;
  saving: boolean;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      <Button fullWidth loading={saving} onClick={onSave}>
        {t('common.save')}
      </Button>
    </div>
  );
}

function RoleField({
  value,
  onChange,
  disabled,
  hint,
}: {
  value: StaffRole;
  onChange: (v: StaffRole) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const { t } = useTranslation();
  return (
    <SelectField<StaffRole>
      label={t('admin.staff.role')}
      value={value}
      onChange={onChange}
      disabled={disabled}
      hint={hint}
      options={[
        { value: 'waiter', label: t('roles.waiter') },
        { value: 'kitchen', label: t('roles.kitchen') },
        { value: 'admin', label: t('roles.admin') },
      ]}
    />
  );
}

function LocaleField({ value, onChange }: { value: Locale; onChange: (v: Locale) => void }) {
  const { t } = useTranslation();
  return (
    <SelectField<Locale>
      label={t('admin.staff.language')}
      value={value}
      onChange={onChange}
      options={[
        { value: 'tr', label: 'Türkçe' },
        { value: 'de', label: 'Deutsch' },
      ]}
    />
  );
}

function CreateStaffSheet({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<StaffRole>('waiter');
  const [locale, setLocale] = useState<Locale>('tr');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === 'admin';

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await callAdminStaff({
        action: 'create',
        display_name: displayName,
        username: username.trim().toLowerCase(),
        role,
        locale,
        pin,
      });
      toast(t('admin.staff.created'), 'ready');
      await onDone();
      onClose();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      side="right"
      onClose={onClose}
      busy={saving}
      title={t('admin.staff.add')}
      closeLabel={t('common.close')}
      footer={<SheetFooter error={error} saving={saving} onSave={() => void submit()} />}
    >
      <div className="flex flex-col gap-4">
        <TextField
          label={t('admin.staff.name')}
          value={displayName}
          onChange={setDisplayName}
          maxLength={60}
        />
        <TextField
          label={t('admin.staff.username')}
          value={username}
          onChange={setUsername}
          hint={t('admin.staff.usernameHint')}
          maxLength={32}
        />
        <RoleField value={role} onChange={setRole} />
        <LocaleField value={locale} onChange={setLocale} />
        <TextField
          label={isAdmin ? t('admin.staff.password') : t('admin.staff.pin')}
          value={pin}
          onChange={setPin}
          hint={isAdmin ? t('admin.staff.passwordHint') : t('admin.staff.pinHint')}
          maxLength={isAdmin ? 72 : 12}
        />
      </div>
    </Sheet>
  );
}

/**
 * Ad, rol ve dil düzenlemesi (`update`). Yalnız **değişen** alanlar gönderilir: fonksiyon her
 * çağrıyı denetim kaydına yazar ve kayıtta "rol değişti" görünmesi yalnız rol gerçekten
 * değiştiğinde anlamlıdır. Kullanıcı adı değişmez — giriş e-postası ondan türetilir.
 *
 * Kendi rolünü düşüren admin bir sonraki tazelemede kendi ekranından atılırdı; sunucu yalnız
 * "son admin" durumunu engeller, bu yüzden kendi rol alanı burada kilitlidir.
 */
function EditStaffSheet({
  target,
  isSelf,
  onClose,
  onDone,
}: {
  target: Profile;
  isSelf: boolean;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(target.display_name);
  const [role, setRole] = useState<StaffRole>(target.role === 'printer' ? 'waiter' : target.role);
  const [locale, setLocale] = useState<Locale>(target.locale);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const patch: Record<string, string> = {};
    if (displayName.trim() !== target.display_name) patch.display_name = displayName.trim();
    if (!isSelf && role !== target.role) patch.role = role;
    if (locale !== target.locale) patch.locale = locale;
    if (Object.keys(patch).length === 0) {
      toast(t('admin.staff.noChanges'), 'info');
      onClose();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await callAdminStaff({ action: 'update', user_id: target.id, ...patch });
      toast(t('admin.staff.updated'), 'ready');
      await onDone();
      // Kendi dilini değiştiren admin'in arayüzü de hemen o dile geçsin.
      if (isSelf) await useAuth.getState().reloadProfile();
      onClose();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      side="right"
      onClose={onClose}
      busy={saving}
      title={t('admin.staff.editTitle', { name: target.display_name })}
      closeLabel={t('common.close')}
      footer={<SheetFooter error={error} saving={saving} onSave={() => void submit()} />}
    >
      <div className="flex flex-col gap-4">
        <TextField
          label={t('admin.staff.name')}
          value={displayName}
          onChange={setDisplayName}
          maxLength={60}
        />
        <TextField
          label={t('admin.staff.username')}
          value={`@${target.username}`}
          onChange={() => undefined}
          disabled
        />
        <RoleField
          value={role}
          onChange={setRole}
          disabled={isSelf}
          hint={isSelf ? t('admin.staff.selfRoleHint') : undefined}
        />
        <LocaleField value={locale} onChange={setLocale} />
      </div>
    </Sheet>
  );
}

function ResetPinSheet({ target, onClose }: { target: Profile; onClose: () => void }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = target.role === 'admin';

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await callAdminStaff({ action: 'reset_pin', user_id: target.id, pin });
      toast(t('admin.staff.updated'), 'ready');
      onClose();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      side="right"
      onClose={onClose}
      busy={saving}
      title={`${t('admin.staff.resetPin')} · ${target.display_name}`}
      closeLabel={t('common.close')}
      footer={<SheetFooter error={error} saving={saving} onSave={() => void submit()} />}
    >
      <TextField
        label={t('admin.staff.newPin')}
        value={pin}
        onChange={setPin}
        hint={isAdmin ? t('admin.staff.passwordHint') : t('admin.staff.pinHint')}
        maxLength={isAdmin ? 72 : 12}
      />
    </Sheet>
  );
}

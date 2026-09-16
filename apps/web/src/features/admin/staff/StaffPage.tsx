import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, UserCheck, UserX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { qk } from '../../../data/keys';
import { useAuth, type Profile } from '../../../lib/auth';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { Spinner } from '../../../ui/Spinner';
import { SelectField, TextField } from '../menu/fields';
import { AdminStaffError, callAdminStaff } from './adminStaffClient';

type StaffRole = 'admin' | 'waiter' | 'kitchen';
type Locale = 'tr' | 'de';

/** Admin tüm profilleri okuyabilir (`profiles_read` RLS). Yazıcı hesabı listede gösterilmez. */
function useStaffList() {
  return useQuery({
    queryKey: qk.adminStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, role, locale, is_active, on_duty_since')
        .neq('role', 'printer')
        .order('is_active', { ascending: false })
        .order('display_name');
      if (error) throw error;
      return data as Profile[];
    },
  });
}

/** Personel: liste, yeni personel, PIN sıfırlama, aktif/pasif. Yazma yolu `admin-staff` fonksiyonudur. */
export function StaffPage() {
  const { t } = useTranslation();
  const { data, isPending } = useStaffList();
  const queryClient = useQueryClient();
  const meId = useAuth((s) => s.profile?.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [pinTarget, setPinTarget] = useState<Profile | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.staff });

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
    <div className="flex flex-col gap-4">
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
          {data.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.display_name}</p>
                <p className="truncate text-muted">
                  @{p.username} · {t(`roles.${p.role}`)} · {p.locale.toUpperCase()}
                </p>
              </div>
              <Badge tone={p.is_active ? 'ready' : 'empty'}>
                {p.is_active ? t('admin.staff.active') : t('admin.staff.inactive')}
              </Badge>
              <div className="flex flex-wrap gap-2">
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
          ))}
        </ul>
      )}

      {createOpen ? (
        <CreateStaffSheet onClose={() => setCreateOpen(false)} onDone={refresh} />
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
      footer={
        <div className="flex flex-col gap-2">
          {error ? (
            <p role="alert" className="text-sm text-danger-ink">
              {error}
            </p>
          ) : null}
          <Button fullWidth loading={saving} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </div>
      }
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
        <SelectField<StaffRole>
          label={t('admin.staff.role')}
          value={role}
          onChange={setRole}
          options={[
            { value: 'waiter', label: t('roles.waiter') },
            { value: 'kitchen', label: t('roles.kitchen') },
            { value: 'admin', label: t('roles.admin') },
          ]}
        />
        <SelectField<Locale>
          label={t('admin.staff.language')}
          value={locale}
          onChange={setLocale}
          options={[
            { value: 'tr', label: 'Türkçe' },
            { value: 'de', label: 'Deutsch' },
          ]}
        />
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
      footer={
        <div className="flex flex-col gap-2">
          {error ? (
            <p role="alert" className="text-sm text-danger-ink">
              {error}
            </p>
          ) : null}
          <Button fullWidth loading={saving} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </div>
      }
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

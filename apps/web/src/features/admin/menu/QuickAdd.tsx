import { formatEuro } from '@ramos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminIngredient, AdminOptionGroup } from '../../../data/adminMenu';
import { qk } from '../../../data/keys';
import { Button } from '../../../ui/Button';
import { MenuApiError, upsertGroup, upsertIngredient, upsertOption } from './adminMenuApi';
import { SelectField, TextField } from './fields';
import {
  cleanName,
  DEFAULT_MULTI_MAX,
  GROUP_KINDS,
  groupShape,
  nameError,
  nextSort,
  priceDeltaCents,
  QUICK_NAME_MAX,
  type GroupKind,
  type NameError,
} from './quickAddLogic';

/**
 * Ürün düzenleyicideki "listede yok, yeni ekle" panelleri (`quickAddLogic.ts`). Her biri kendi
 * kaydını hemen yazar ve menü sorgularını tazeler; ürüne bağlama ürünün Kaydet'iyle olur.
 * Düzenleyicide `<form>` yok, ama alanlarda Enter'ın yine de ekleme yapması için yakalanır.
 */

const NAME_ERROR_KEY = {
  required: 'admin.menu.quick.errors.required',
  too_long: 'admin.menu.quick.errors.tooLong',
  taken: 'admin.menu.quick.errors.taken',
} as const satisfies Record<NameError, string>;

const KIND_KEY = {
  single: 'admin.menu.quick.kinds.single',
  multi: 'admin.menu.quick.kinds.multi',
  extra: 'admin.menu.quick.kinds.extra',
} as const satisfies Record<GroupKind, string>;

/** Sunucu hatası: aynı grupta aynı ad (23505) ayrı söylenir, gerisi genel hata. */
const saveErrorKey = (e: unknown) =>
  e instanceof MenuApiError && e.code === '23505'
    ? 'admin.menu.quick.errors.taken'
    : e instanceof MenuApiError && e.code === '42501'
      ? 'errors.not_authorized'
      : 'errors.unknown';

function useMenuRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: qk.menu });
}

const onEnter = (run: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    run();
  }
};

function Panel({
  title,
  hint,
  children,
  onEnterKey,
}: {
  title: string;
  hint: string;
  children: ReactNode;
  onEnterKey: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={title}
      onKeyDown={onEnter(onEnterKey)}
      className="flex flex-col gap-3 rounded-control border border-dashed border-border p-3"
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function OpenButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div>
      <Button variant="ghost" icon={<Plus aria-hidden size={18} />} onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}

function Actions({
  saving,
  submitLabel,
  onSubmit,
  onCancel,
  error,
}: {
  saving: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
  error: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-xs text-danger-ink">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" loading={saving} onClick={onSubmit}>
          {submitLabel}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onCancel}>
          {t('admin.menu.quick.cancel')}
        </Button>
      </div>
    </div>
  );
}

/** Kütüphanede olmayan çıkarılabilir malzeme ("ohne …"). */
export function QuickAddIngredient({
  ingredients,
  onCreated,
}: {
  ingredients: readonly AdminIngredient[];
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const refresh = useMenuRefresh();
  const [open, setOpen] = useState(false);
  const [de, setDe] = useState('');
  const [tr, setTr] = useState('');
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameErr = nameError(de, ingredients.map((i) => i.name_de));
  const reset = () => {
    setOpen(false);
    setDe('');
    setTr('');
    setShown(false);
    setError(null);
  };

  const submit = async () => {
    if (saving) return;
    setShown(true);
    if (nameErr) return;
    setSaving(true);
    setError(null);
    try {
      const id = await upsertIngredient({ name_de: cleanName(de), name_tr: cleanName(tr) || null, is_active: true });
      await refresh();
      onCreated(id);
      reset();
    } catch (e) {
      setError(t(saveErrorKey(e)));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return <OpenButton label={t('admin.menu.quick.newIngredient')} onClick={() => setOpen(true)} />;
  return (
    <Panel
      title={t('admin.menu.quick.newIngredient')}
      hint={t('admin.menu.quick.ingredientHint')}
      onEnterKey={() => void submit()}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={t('admin.menu.quick.nameDe')}
          value={de}
          maxLength={QUICK_NAME_MAX}
          lang="de"
          placeholder="Gurken"
          error={shown && nameErr ? t(NAME_ERROR_KEY[nameErr]) : null}
          onChange={setDe}
        />
        <TextField
          label={t('admin.menu.quick.nameTr')}
          value={tr}
          maxLength={QUICK_NAME_MAX}
          placeholder="Salatalık"
          onChange={setTr}
        />
      </div>
      <Actions
        saving={saving}
        submitLabel={t('admin.menu.quick.addAndSelect')}
        onSubmit={() => void submit()}
        onCancel={reset}
        error={error}
      />
    </Panel>
  );
}

/** Seçilmiş bir grubun seçenekleri + o gruba yeni seçenek ekleme. */
export function GroupOptionsQuickAdd({ group }: { group: AdminOptionGroup }) {
  const { t } = useTranslation();
  const refresh = useMenuRefresh();
  const [open, setOpen] = useState(false);
  const [de, setDe] = useState('');
  const [tr, setTr] = useState('');
  const [price, setPrice] = useState('');
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = group.options.filter((o) => o.is_active).sort((a, b) => a.sort - b.sort);
  const nameErr = nameError(de, group.options.map((o) => o.name_de));
  const cents = priceDeltaCents(price);
  const reset = () => {
    setOpen(false);
    setDe('');
    setTr('');
    setPrice('');
    setShown(false);
    setError(null);
  };

  const submit = async () => {
    if (saving) return;
    setShown(true);
    if (nameErr || cents === null) return;
    setSaving(true);
    setError(null);
    try {
      await upsertOption({
        group_id: group.id,
        name_de: cleanName(de),
        name_tr: cleanName(tr) || null,
        price_delta_cents: cents,
        is_default: false,
        is_exclusive: false,
        sort: nextSort(group.options),
        is_active: true,
      });
      await refresh();
      reset();
    } catch (e) {
      setError(t(saveErrorKey(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-control border border-border p-3">
      <p className="text-sm font-semibold">{group.admin_label || group.name_de}</p>
      <p className="text-xs text-muted">
        {active.length === 0
          ? t('admin.menu.groups.noOptions')
          : active
              .map((o) => (o.price_delta_cents ? `${o.name_de} +${formatEuro(o.price_delta_cents)}` : o.name_de))
              .join(' · ')}
      </p>
      {open ? (
        <Panel
          title={t('admin.menu.quick.newOption', { group: group.admin_label || group.name_de })}
          hint={t('admin.menu.quick.optionHint')}
          onEnterKey={() => void submit()}
        >
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
            <TextField
              label={t('admin.menu.quick.nameDe')}
              value={de}
              maxLength={QUICK_NAME_MAX}
              lang="de"
              placeholder="BBQ-Soße"
              error={shown && nameErr ? t(NAME_ERROR_KEY[nameErr]) : null}
              onChange={setDe}
            />
            <TextField
              label={t('admin.menu.quick.nameTr')}
              value={tr}
              maxLength={QUICK_NAME_MAX}
              placeholder="Barbekü sos"
              onChange={setTr}
            />
            <TextField
              label={t('admin.menu.groups.priceDelta')}
              value={price}
              inputMode="decimal"
              placeholder="0,00"
              error={shown && cents === null ? t('admin.menu.errors.priceInvalid') : null}
              onChange={setPrice}
            />
          </div>
          <Actions
            saving={saving}
            submitLabel={t('admin.menu.quick.addOption')}
            onSubmit={() => void submit()}
            onCancel={reset}
            error={error}
          />
        </Panel>
      ) : (
        <OpenButton label={t('admin.menu.quick.newOptionButton')} onClick={() => setOpen(true)} />
      )}
    </div>
  );
}

/** Kütüphanede olmayan seçim grubu: ad + tür + ilk seçenek; oluşturulunca bu ürüne eklenir. */
export function QuickAddGroup({
  groups,
  onCreated,
}: {
  groups: readonly AdminOptionGroup[];
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const refresh = useMenuRefresh();
  const [open, setOpen] = useState(false);
  const [groupDe, setGroupDe] = useState('');
  const [groupTr, setGroupTr] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<GroupKind>('multi');
  const [max, setMax] = useState(String(DEFAULT_MULTI_MAX));
  const [optDe, setOptDe] = useState('');
  const [optTr, setOptTr] = useState('');
  const [price, setPrice] = useState('');
  const [shown, setShown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupErr = nameError(groupDe, []);
  const optErr = nameError(optDe, []);
  const maxNum = Number(max);
  const maxInvalid = kind !== 'single' && (!Number.isInteger(maxNum) || maxNum < 1 || maxNum > 20);
  const cents = priceDeltaCents(price);
  const reset = () => {
    setOpen(false);
    setGroupDe('');
    setGroupTr('');
    setLabel('');
    setKind('multi');
    setMax(String(DEFAULT_MULTI_MAX));
    setOptDe('');
    setOptTr('');
    setPrice('');
    setShown(false);
    setError(null);
  };

  const submit = async () => {
    if (saving) return;
    setShown(true);
    if (groupErr || optErr || maxInvalid || cents === null) return;
    setSaving(true);
    setError(null);
    try {
      const shape = groupShape(kind, maxNum);
      const id = await upsertGroup({
        admin_label: cleanName(label) || cleanName(groupDe),
        name_de: cleanName(groupDe),
        name_tr: cleanName(groupTr) || null,
        ...shape,
        sort: nextSort(groups),
        is_active: true,
      });
      // Zorunlu tek seçimli grupta ilk seçenek varsayılan olur: garson paneli onu seçili açar.
      await upsertOption({
        group_id: id,
        name_de: cleanName(optDe),
        name_tr: cleanName(optTr) || null,
        price_delta_cents: cents,
        is_default: kind === 'single',
        is_exclusive: false,
        sort: 10,
        is_active: true,
      });
      await refresh();
      onCreated(id);
      reset();
    } catch (e) {
      setError(t(saveErrorKey(e)));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return <OpenButton label={t('admin.menu.quick.newGroup')} onClick={() => setOpen(true)} />;
  return (
    <Panel title={t('admin.menu.quick.newGroup')} hint={t('admin.menu.quick.groupHint')} onEnterKey={() => void submit()}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={t('admin.menu.quick.groupNameDe')}
          value={groupDe}
          maxLength={QUICK_NAME_MAX}
          lang="de"
          placeholder="Soße"
          error={shown && groupErr ? t(NAME_ERROR_KEY[groupErr]) : null}
          onChange={setGroupDe}
        />
        <TextField
          label={t('admin.menu.quick.nameTr')}
          value={groupTr}
          maxLength={QUICK_NAME_MAX}
          placeholder="Sos"
          onChange={setGroupTr}
        />
        <SelectField<GroupKind>
          label={t('admin.menu.quick.kind')}
          value={kind}
          onChange={setKind}
          options={GROUP_KINDS.map((k) => ({ value: k, label: t(KIND_KEY[k]) }))}
        />
        {kind === 'single' ? (
          <TextField
            label={t('admin.menu.groups.adminLabel')}
            value={label}
            maxLength={QUICK_NAME_MAX}
            hint={t('admin.menu.groups.adminLabelHint')}
            onChange={setLabel}
          />
        ) : (
          <TextField
            label={t('admin.menu.groups.max')}
            value={max}
            inputMode="numeric"
            error={shown && maxInvalid ? t('admin.menu.quick.errors.max') : null}
            onChange={setMax}
          />
        )}
      </div>
      <p className="text-xs font-medium text-muted">{t('admin.menu.quick.firstOption')}</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem]">
        <TextField
          label={t('admin.menu.quick.nameDe')}
          value={optDe}
          maxLength={QUICK_NAME_MAX}
          lang="de"
          placeholder="Knoblauch"
          error={shown && optErr ? t(NAME_ERROR_KEY[optErr]) : null}
          onChange={setOptDe}
        />
        <TextField
          label={t('admin.menu.quick.nameTr')}
          value={optTr}
          maxLength={QUICK_NAME_MAX}
          placeholder="Sarımsaklı"
          onChange={setOptTr}
        />
        <TextField
          label={t('admin.menu.groups.priceDelta')}
          value={price}
          inputMode="decimal"
          placeholder="0,00"
          error={shown && cents === null ? t('admin.menu.errors.priceInvalid') : null}
          onChange={setPrice}
        />
      </div>
      <Actions
        saving={saving}
        submitLabel={t('admin.menu.quick.createGroup')}
        onSubmit={() => void submit()}
        onCancel={reset}
        error={error}
      />
    </Panel>
  );
}

import type { TicketFormat } from '@ramos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminMenu, usageCounts, type AdminOptionGroup } from '../../../data/adminMenu';
import { qk } from '../../../data/keys';
import { toast } from '../../../lib/toast';
import { Button } from '../../../ui/Button';
import { IconButton } from '../../../ui/IconButton';
import { Sheet } from '../../../ui/Sheet';
import { Spinner } from '../../../ui/Spinner';
import { upsertGroup, upsertOption } from './adminMenuApi';
import { MoveButtons, Section, SelectField, TextField, Toggle } from './fields';
import { reorder, validateGroup } from './menuAdminLogic';
import { centsToInput, parseEuroInput } from './money';

const FORMATS: TicketFormat[] = ['label_values', 'values_only', 'plus_each'];

interface OptionDraft {
  key: string;
  id?: string;
  name_de: string;
  name_tr: string;
  priceInput: string;
  is_default: boolean;
  is_exclusive: boolean;
  is_active: boolean;
}

interface GroupDraft {
  id?: string;
  admin_label: string;
  name_de: string;
  name_tr: string;
  min_select: string;
  max_select: string;
  ticket_format: TicketFormat;
  is_active: boolean;
  options: OptionDraft[];
}

const emptyGroup = (): GroupDraft => ({
  admin_label: '',
  name_de: '',
  name_tr: '',
  min_select: '0',
  max_select: '1',
  ticket_format: 'label_values',
  is_active: true,
  options: [],
});

const draftOf = (g: AdminOptionGroup): GroupDraft => ({
  id: g.id,
  admin_label: g.admin_label,
  name_de: g.name_de,
  name_tr: g.name_tr ?? '',
  min_select: String(g.min_select),
  max_select: String(g.max_select),
  ticket_format: g.ticket_format,
  is_active: g.is_active,
  options: g.options
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map((o) => ({
      key: o.id,
      id: o.id,
      name_de: o.name_de,
      name_tr: o.name_tr ?? '',
      priceInput: centsToInput(o.price_delta_cents),
      is_default: o.is_default,
      is_exclusive: o.is_exclusive,
      is_active: o.is_active,
    })),
});

/**
 * Menü > Seçim grupları. Kaydetmeden önce `validateGroup` çalışır: kuralları kendi içinde
 * tutarsız bir grup ("en az 5 seç" ama 4 seçenek) garsonun "Sepete ekle" düğmesini kalıcı
 * olarak kilitler — hatayı burada göstermek, akşam servisinde bulmaktan ucuzdur.
 */
export function OptionGroupsPage() {
  const { t, i18n } = useTranslation();
  const isTr = i18n.language !== 'de';
  const queryClient = useQueryClient();
  const { groups, products, isPending } = useAdminMenu();
  const [editing, setEditing] = useState<GroupDraft | null>(null);

  const counts = useMemo(() => usageCounts(products).groups, [products]);

  if (isPending) {
    return (
      <p className="flex items-center justify-center gap-2 px-4 py-10 text-muted">
        <Spinner label={t('common.loading')} />
        <span>{t('common.loading')}</span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button icon={<Plus aria-hidden size={20} />} onClick={() => setEditing(emptyGroup())}>
          {t('admin.menu.groups.add')}
        </Button>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-card border border-border bg-surface px-4 py-10 text-center text-muted">
          {t('admin.menu.groups.empty')}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setEditing(draftOf(g))}
                className="flex w-full min-h-16 cursor-pointer items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{g.admin_label || g.name_de}</span>
                  <span className="block truncate text-xs text-muted">
                    {isTr && g.name_tr ? g.name_tr : g.name_de} · {t('admin.menu.groups.range', { min: g.min_select, max: g.max_select })}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {t('admin.menu.usedIn', { count: counts.get(g.id) ?? 0 })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <GroupEditor
          key={editing.id ?? 'new'}
          draft={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void queryClient.invalidateQueries({ queryKey: qk.menu });
            toast(t('admin.menu.saved'));
          }}
        />
      ) : null}
    </div>
  );
}

function GroupEditor({
  draft,
  onClose,
  onSaved,
}: {
  draft: GroupDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<GroupDraft>(draft);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  const patch = (fields: Partial<GroupDraft>) => setForm((f) => ({ ...f, ...fields }));
  const patchOption = (key: string, fields: Partial<OptionDraft>) =>
    setForm((f) => ({ ...f, options: f.options.map((o) => (o.key === key ? { ...o, ...fields } : o)) }));

  const moveOption = (fromKey: string, toKey: string) => {
    const order = reorder(form.options.map((o) => ({ id: o.key })), fromKey, toKey);
    if (order.length === 0) return;
    const byKey = new Map(form.options.map((o) => [o.key, o]));
    patch({ options: order.map((o) => byKey.get(o.id)).filter((o): o is OptionDraft => Boolean(o)) });
  };

  const save = async () => {
    const found: Record<string, string> = {};
    if (!form.name_de.trim()) found.name_de = t('admin.menu.errors.nameRequired');
    if (!form.admin_label.trim()) found.admin_label = t('admin.menu.errors.nameRequired');

    const min = Number(form.min_select);
    const max = Number(form.max_select);
    if (!Number.isInteger(min) || min < 0) found.min_select = t('admin.menu.errors.numberInvalid');
    if (!Number.isInteger(max) || max < 1) found.max_select = t('admin.menu.errors.numberInvalid');

    for (const o of form.options.filter((x) => x.is_active)) {
      if (!o.name_de.trim()) found[`${o.key}:name`] = t('admin.menu.errors.nameRequired');
      if (parseEuroInput(o.priceInput.replace(/^-/, '')) === null) {
        found[`${o.key}:price`] = t('admin.menu.errors.priceInvalid');
      }
    }

    if (!found.min_select && !found.max_select) {
      const problem = validateGroup(
        { min_select: min, max_select: max },
        form.options.filter((o) => o.is_active).length,
      );
      if (problem) found.rules = t(`admin.menu.errors.${problem}`);
    }

    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const groupId = await upsertGroup({
        id: form.id,
        admin_label: form.admin_label.trim(),
        name_de: form.name_de.trim(),
        name_tr: form.name_tr.trim() || null,
        min_select: min,
        max_select: max,
        ticket_format: form.ticket_format,
        sort: 0,
        is_active: form.is_active,
      });
      for (const [i, o] of form.options.entries()) {
        const negative = o.priceInput.trim().startsWith('-');
        const abs = parseEuroInput(o.priceInput.replace(/^-/, '')) ?? 0;
        await upsertOption({
          id: o.id,
          group_id: groupId,
          name_de: o.name_de.trim(),
          name_tr: o.name_tr.trim() || null,
          price_delta_cents: negative ? -abs : abs,
          is_default: o.is_default,
          is_exclusive: o.is_exclusive,
          sort: (i + 1) * 10,
          is_active: o.is_active,
        });
      }
      onSaved();
    } catch {
      setErrors({ form: t('errors.unknown') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open
      side="right"
      busy={saving}
      onClose={onClose}
      title={form.admin_label || t('admin.menu.groups.add')}
      closeLabel={t('common.close')}
      footer={
        <Button fullWidth size="lg" icon={<Save aria-hidden size={20} />} loading={saving} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-4">
        {errors.form || errors.rules ? (
          <p role="alert" className="rounded-card border border-danger/40 bg-danger/15 px-3 py-2 text-sm text-danger-ink">
            {errors.form ?? errors.rules}
          </p>
        ) : null}

        <Section title={t('admin.menu.sections.basics')}>
          <TextField
            label={t('admin.menu.groups.adminLabel')}
            hint={t('admin.menu.groups.adminLabelHint')}
            value={form.admin_label}
            error={errors.admin_label}
            onChange={(admin_label) => patch({ admin_label })}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={t('admin.menu.nameDe')}
              value={form.name_de}
              error={errors.name_de}
              onChange={(name_de) => patch({ name_de })}
            />
            <TextField label={t('admin.menu.nameTr')} value={form.name_tr} onChange={(name_tr) => patch({ name_tr })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label={t('admin.menu.groups.min')}
              type="number"
              value={form.min_select}
              error={errors.min_select}
              inputClassName="tabular"
              onChange={(min_select) => patch({ min_select })}
            />
            <TextField
              label={t('admin.menu.groups.max')}
              type="number"
              value={form.max_select}
              error={errors.max_select}
              inputClassName="tabular"
              onChange={(max_select) => patch({ max_select })}
            />
            <SelectField
              label={t('admin.menu.groups.format')}
              value={form.ticket_format}
              onChange={(ticket_format) => patch({ ticket_format })}
              options={FORMATS.map((f) => ({ value: f, label: t(`admin.menu.groups.formats.${f}`) }))}
            />
          </div>
          <Toggle label={t('admin.menu.isActive')} checked={form.is_active} onChange={(is_active) => patch({ is_active })} />
        </Section>

        <Section
          title={t('admin.menu.groups.options')}
          action={
            <Button
              variant="secondary"
              icon={<Plus aria-hidden size={18} />}
              onClick={() =>
                patch({
                  options: [
                    ...form.options,
                    {
                      key: crypto.randomUUID(),
                      name_de: '',
                      name_tr: '',
                      priceInput: '0,00',
                      is_default: false,
                      is_exclusive: false,
                      is_active: true,
                    },
                  ],
                })
              }
            >
              {t('common.add')}
            </Button>
          }
        >
          {form.options.length === 0 ? (
            <p className="text-xs text-muted">{t('admin.menu.groups.noOptions')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {form.options.map((o, i) => (
                <li
                  key={o.key}
                  className={`flex flex-col gap-2 rounded-card border border-border p-3 ${o.is_active ? 'bg-surface-2' : 'bg-surface-2/40'}`}
                >
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem]">
                    <TextField
                      label={t('admin.menu.nameDe')}
                      value={o.name_de}
                      disabled={!o.is_active}
                      error={errors[`${o.key}:name`]}
                      onChange={(name_de) => patchOption(o.key, { name_de })}
                    />
                    <TextField
                      label={t('admin.menu.nameTr')}
                      value={o.name_tr}
                      disabled={!o.is_active}
                      onChange={(name_tr) => patchOption(o.key, { name_tr })}
                    />
                    <TextField
                      label={t('admin.menu.groups.priceDelta')}
                      value={o.priceInput}
                      disabled={!o.is_active}
                      inputClassName="tabular"
                      error={errors[`${o.key}:price`]}
                      onChange={(priceInput) => patchOption(o.key, { priceInput })}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-4">
                      <Toggle
                        label={t('admin.menu.groups.isDefault')}
                        checked={o.is_default}
                        onChange={(is_default) => patchOption(o.key, { is_default })}
                      />
                      <Toggle
                        label={t('admin.menu.groups.isExclusive')}
                        checked={o.is_exclusive}
                        onChange={(is_exclusive) => patchOption(o.key, { is_exclusive })}
                      />
                    </div>
                    <span className="flex items-center gap-1">
                      <MoveButtons
                        disabledUp={i === 0}
                        disabledDown={i === form.options.length - 1}
                        onUp={() => moveOption(o.key, form.options[i - 1]?.key ?? o.key)}
                        onDown={() => moveOption(o.key, form.options[i + 1]?.key ?? o.key)}
                      />
                      {o.is_active ? (
                        <IconButton
                          label={t('admin.menu.groups.deactivateOption')}
                          icon={<Trash2 aria-hidden size={18} />}
                          onClick={() => patchOption(o.key, { is_active: false, is_default: false })}
                        />
                      ) : (
                        <IconButton
                          label={t('admin.menu.groups.reactivateOption')}
                          icon={<RotateCcw aria-hidden size={18} />}
                          onClick={() => patchOption(o.key, { is_active: true })}
                        />
                      )}
                    </span>
                  </div>
                  {!o.is_active ? <p className="text-xs text-muted">{t('admin.menu.variants.inactiveNote')}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </Sheet>
  );
}

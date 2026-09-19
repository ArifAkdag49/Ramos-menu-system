import { clsx } from 'clsx';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { useId, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings, useUpdateSettings, type SettingsRow } from '../../../data/settings';
import { useStaffNames } from '../../../data/staff';
import { useAuth } from '../../../lib/auth';
import { toast } from '../../../lib/toast';
import { Banner } from '../../../ui/Banner';
import { Button } from '../../../ui/Button';
import { Spinner } from '../../../ui/Spinner';
import { FIELD, MoveButtons, Section, SelectField, TextField, Toggle } from '../menu/fields';
import { TicketPayloadPaper } from '../menu/TicketPreview';
import { formatDateTime } from '../orders/orderView';
import { PrinterCard } from '../PrinterCard';
import { PrintRouteSection } from './PrintRouteSection';
import { QrMenuSection } from './QrMenuSection';
import {
  addRow,
  applyPrinterPreset,
  codepageChoices,
  detectPrinterPreset,
  formFromSettings,
  isSettingsDirty,
  moveRow,
  newRowKey,
  removeRow,
  settingsPatch,
  settingsPreviewPayload,
  TICKET_HEADER_MAX,
  updateRow,
  validateSettings,
  type PrinterPresetId,
  type SettingsErrorKey,
  type SettingsForm,
} from './settingsLogic';

const ERROR_KEY = {
  host_invalid: 'admin.settings.errors.host_invalid',
  port_invalid: 'admin.settings.errors.port_invalid',
  header_empty: 'admin.settings.errors.header_empty',
  header_too_long: 'admin.settings.errors.header_too_long',
  time_invalid: 'admin.settings.errors.time_invalid',
  name_empty: 'admin.settings.errors.name_empty',
  text_empty: 'admin.settings.errors.text_empty',
  code_empty: 'admin.settings.errors.code_empty',
  code_invalid: 'admin.settings.errors.code_invalid',
  code_duplicate: 'admin.settings.errors.code_duplicate',
} as const satisfies Record<SettingsErrorKey, string>;

const CODEPAGE_KEY = {
  'cp857/61': 'admin.settings.printer.codepages.cp857',
  'windows1254/91': 'admin.settings.printer.codepages.windows1254',
  'windows1254/48': 'admin.settings.printer.codepages.windows1254_48',
  'cp857/13': 'admin.settings.printer.codepages.cp857_13',
  'cp858/19': 'admin.settings.printer.codepages.cp858',
  'cp437/0': 'admin.settings.printer.codepages.cp437',
} as const;

const PRINTER_TYPE_KEY = {
  xprinter: 'admin.settings.printer.types.xprinter',
  epson: 'admin.settings.printer.types.epson',
  epson_epos: 'admin.settings.printer.types.epson_epos',
  custom: 'admin.settings.printer.types.custom',
} as const satisfies Record<PrinterPresetId, string>;

/** Liste satırının eylem sütunu (masaüstü): iki taşı düğmesi (2 × 48 px) + "Sil / Entfernen". */
const ACTIONS_TRACK = '15rem';

/** Liste satırlarında metin sınırı: iptal sebebi ve kalem notu sunucuda en fazla 200 karakter. */
const LIST_TEXT_MAX = 200;

/**
 * Admin > Ayarlar (spec §8.4). Tek satırlık `settings` kaydı: genel, fiş, yazıcı ve üç liste
 * (hızlı notlar, iptal sebepleri, alerjen lejantı). Tek ana eylem alttaki yapışkan "Kaydet"tir;
 * değişiklik yokken pasiftir. Kayıt Realtime `settings` olayını tetikler: garson/KDS ekranları ve
 * yazdırma ajanı yeni ayarı okur, bir sonraki fiş yeni ayarla basılır.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const row = useSettings();

  if (!row) {
    return (
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t('admin.settings.title')}</h1>
        <p className="flex items-center justify-center gap-2 px-4 py-10 text-muted">
          <Spinner label={t('common.loading')} />
          <span>{t('common.loading')}</span>
        </p>
      </div>
    );
  }
  return <SettingsEditor row={row} />;
}

type ListName = 'quick_notes' | 'cancel_reasons' | 'allergen_legend';

function SettingsEditor({ row }: { row: SettingsRow }) {
  const { t } = useTranslation();
  const meId = useAuth((s) => s.profile?.id ?? null);
  const staffNames = useStaffNames();
  const update = useUpdateSettings();
  const formRef = useRef<HTMLFormElement>(null);

  const [form, setForm] = useState<SettingsForm>(() => formFromSettings(row));
  const [loadedRow, setLoadedRow] = useState(row);
  const [conflict, setConflict] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [previewAt] = useState(() => new Date());
  // "Özel" elle seçildiyse alanlar bir hazır seçime uysa bile "Özel" görünür kalır.
  const [customPrinterType, setCustomPrinterType] = useState(false);

  // Kayıt dışarıda değişti (kendi kaydımız ya da başka bir cihaz — Realtime `settings`). Yerel
  // değişiklik yoksa ya da form zaten yeni kayda eşitse sessizce yenilenir; yoksa operatörün
  // yazdıkları silinmez, üstte uyarı çıkar. React'in "önceki prop'a göre state" kalıbı: efekt değil,
  // çizim sırasında tek seferlik güncelleme.
  if (row !== loadedRow) {
    setLoadedRow(row);
    if (!isSettingsDirty(formFromSettings(row), loadedRow)) {
      // Yalnız formda olmayan bir alan değişti (ör. "Baskı yolu" bölümünün kendi kaydı): yerel
      // değişikliklere dokunulmaz, çakışma da yoktur.
    } else if (!isSettingsDirty(form, loadedRow) || !isSettingsDirty(form, row)) {
      setForm(formFromSettings(row));
      setConflict(false);
    } else {
      setConflict(true);
    }
  }

  const dirty = isSettingsDirty(form, row);
  const errors = validateSettings(form);
  const visibleErrors = showErrors ? errors : {};
  const errorText = (key: string): string | null => {
    const e = visibleErrors[key];
    return e ? t(ERROR_KEY[e]) : null;
  };

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const saved = settingsPatch(formFromSettings(row));
  const patch = settingsPatch(form);
  const printerDirty =
    patch.printer_host !== saved.printer_host ||
    patch.printer_port !== saved.printer_port ||
    patch.printer_codepage !== saved.printer_codepage ||
    patch.printer_codepage_number !== saved.printer_codepage_number ||
    patch.printer_transliterate !== saved.printer_transliterate;

  const save = () => {
    if (!dirty || update.isPending) return;
    if (Object.keys(errors).length > 0) {
      // Bildirim (toast) yok: alttaki kayıt çubuğu aynı şeyi söyler; toast çubuğun üstüne binip
      // "Kaydet"i örterdi. Hata metni çizildikten sonra ilk hatalı alana gidilir ve alan ekranın
      // ortasına kaydırılır ki yapışkan çubuğun arkasında kalmasın.
      setShowErrors(true);
      requestAnimationFrame(() => {
        const field = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        field?.focus({ preventScroll: true });
        field?.scrollIntoView?.({ block: 'center' });
      });
      return;
    }
    update.mutate(
      { ...patch, updated_by: meId },
      {
        onSuccess: () => {
          setShowErrors(false);
          setConflict(false);
          toast(t('admin.settings.saved'));
        },
        onError: () => toast(t('admin.settings.saveError'), 'danger'),
      },
    );
  };

  const discard = () => {
    setForm(formFromSettings(row));
    setCustomPrinterType(false);
    setConflict(false);
    setShowErrors(false);
  };

  const addListRow = (name: ListName) => {
    const key = newRowKey();
    setFocusKey(key);
    setForm((f) => {
      switch (name) {
        case 'quick_notes':
          return { ...f, quick_notes: addRow(f.quick_notes, { key, de: '', tr: '' }) };
        case 'cancel_reasons':
          return {
            ...f,
            cancel_reasons: addRow(f.cancel_reasons, { key, de: '', tr: '', freeText: false }),
          };
        case 'allergen_legend':
          return {
            ...f,
            allergen_legend: addRow(f.allergen_legend, { key, code: '', de: '', tr: '' }),
          };
      }
    });
  };

  const updatedBy = row.updated_by ? staffNames.get(row.updated_by) : undefined;
  const choices = codepageChoices(form.codepage);
  const printerType: PrinterPresetId = customPrinterType ? 'custom' : detectPrinterPreset(form);
  const choosePrinterType = (id: PrinterPresetId) => {
    setCustomPrinterType(id === 'custom');
    setForm((f) => applyPrinterPreset(f, id));
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="mx-auto flex max-w-[1400px] flex-col gap-6"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('admin.settings.title')}</h1>
        <p className="text-muted">
          {updatedBy
            ? t('admin.settings.lastSavedBy', {
                at: formatDateTime(row.updated_at),
                name: updatedBy,
              })
            : t('admin.settings.lastSaved', { at: formatDateTime(row.updated_at) })}
        </p>
      </header>

      {conflict ? (
        <Banner
          tone="warning"
          icon={<AlertTriangle aria-hidden size={20} />}
          action={
            <Button
              variant="secondary"
              icon={<RotateCcw aria-hidden size={18} />}
              onClick={discard}
              className="shrink-0"
            >
              {t('admin.settings.reload')}
            </Button>
          }
          className="flex-wrap"
        >
          {t('admin.settings.conflict')}
        </Banner>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Section
            level={2}
            title={t('admin.settings.general.title')}
            description={t('admin.settings.general.description')}
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <TextField
                label={t('admin.settings.general.restaurantName')}
                value={form.restaurant_name}
                maxLength={80}
                error={errorText('restaurant_name')}
                onChange={(v) => set('restaurant_name', v)}
              />
              <TextField
                type="time"
                label={t('admin.settings.general.dayStart')}
                value={form.business_day_start}
                error={errorText('business_day_start')}
                onChange={(v) => set('business_day_start', v)}
              />
            </div>
            <p className="text-xs text-muted">{t('admin.settings.general.dayStartHint')}</p>
          </Section>

          <QrMenuSection />

          <Section
            level={2}
            title={t('admin.settings.ticket.title')}
            description={t('admin.settings.ticket.description')}
          >
            <TextField
              label={t('admin.settings.ticket.header')}
              value={form.ticket_header}
              maxLength={TICKET_HEADER_MAX}
              error={errorText('ticket_header')}
              hint={t('admin.settings.ticket.headerHint', { max: TICKET_HEADER_MAX })}
              inputClassName="font-mono"
              onChange={(v) => set('ticket_header', v)}
            />
            <TextField
              label={t('admin.settings.ticket.footer')}
              value={form.ticket_footer}
              maxLength={LIST_TEXT_MAX}
              hint={t('admin.settings.ticket.footerHint')}
              onChange={(v) => set('ticket_footer', v)}
            />
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted">{t('admin.settings.ticket.preview')}</p>
              <TicketPayloadPaper
                payload={settingsPreviewPayload(form.ticket_header, form.ticket_footer, previewAt)}
                transliterate={form.printer_transliterate}
              />
            </div>
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <PrintRouteSection />

          <Section
            level={2}
            title={t('admin.settings.printer.title')}
            description={t('admin.settings.printer.description')}
          >
            <SelectField<PrinterPresetId>
              label={t('admin.settings.printer.type')}
              value={printerType}
              hint={t('admin.settings.printer.typeHint')}
              onChange={choosePrinterType}
              options={(['xprinter', 'epson', 'epson_epos', 'custom'] as const).map((id) => ({
                value: id,
                label: t(PRINTER_TYPE_KEY[id]),
              }))}
            />
            {printerType === 'epson' ? (
              <p role="note" className="text-sm text-muted">
                {t('admin.settings.printer.epsonHint')}
              </p>
            ) : null}
            {printerType === 'epson_epos' ? (
              <p role="note" className="text-sm text-muted">
                {t('admin.settings.printer.eposHint')}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <TextField
                label={t('admin.settings.printer.host')}
                value={form.printer_host}
                placeholder="192.168.1.50"
                maxLength={253}
                inputMode="url"
                error={errorText('printer_host')}
                hint={t('admin.settings.printer.hostHint')}
                onChange={(v) => set('printer_host', v)}
              />
              <TextField
                label={t('admin.settings.printer.port')}
                value={form.printer_port}
                placeholder="9100"
                maxLength={5}
                inputMode="numeric"
                error={errorText('printer_port')}
                hint={t('admin.settings.printer.portHint')}
                onChange={(v) => set('printer_port', v)}
              />
            </div>
            <SelectField
              label={t('admin.settings.printer.codepage')}
              value={form.codepage}
              hint={t('admin.settings.printer.codepageHint')}
              onChange={(v) => set('codepage', v)}
              options={choices.map((value) => ({
                value,
                label:
                  value in CODEPAGE_KEY
                    ? t(CODEPAGE_KEY[value as keyof typeof CODEPAGE_KEY])
                    : value,
              }))}
            />
            <Toggle
              label={t('admin.settings.printer.transliterate')}
              hint={t('admin.settings.printer.transliterateHint')}
              checked={form.printer_transliterate}
              onChange={(v) => set('printer_transliterate', v)}
            />
            {printerDirty ? (
              <p role="status" className="flex items-start gap-2 text-warning">
                <AlertTriangle aria-hidden size={18} className="mt-0.5 shrink-0" />
                <span>{t('admin.settings.printer.saveBeforeTest')}</span>
              </p>
            ) : null}
          </Section>

          <PrinterCard />
        </div>
      </div>

      <Section
        level={2}
        title={t('admin.settings.quickNotes.title')}
        description={t('admin.settings.quickNotes.description')}
      >
        <ListEditor
          name="quick_notes"
          rows={form.quick_notes}
          onChange={(rows) => set('quick_notes', rows)}
          onAdd={() => addListRow('quick_notes')}
          focusKey={focusKey}
          errorText={errorText}
          addLabel={t('admin.settings.quickNotes.add')}
          emptyText={t('admin.settings.quickNotes.empty')}
          columns={[
            {
              field: 'de',
              label: t('admin.settings.columns.de'),
              track: 'minmax(0,1fr)',
              lang: 'de',
            },
            {
              field: 'tr',
              label: t('admin.settings.columns.tr'),
              track: 'minmax(0,1fr)',
              lang: 'tr',
            },
          ]}
        />
      </Section>

      <Section
        level={2}
        title={t('admin.settings.cancelReasons.title')}
        description={t('admin.settings.cancelReasons.description')}
      >
        <ListEditor
          name="cancel_reasons"
          rows={form.cancel_reasons}
          onChange={(rows) => set('cancel_reasons', rows)}
          onAdd={() => addListRow('cancel_reasons')}
          focusKey={focusKey}
          errorText={errorText}
          addLabel={t('admin.settings.cancelReasons.add')}
          emptyText={t('admin.settings.cancelReasons.empty')}
          columns={[
            {
              field: 'de',
              label: t('admin.settings.columns.de'),
              track: 'minmax(0,1fr)',
              lang: 'de',
            },
            {
              field: 'tr',
              label: t('admin.settings.columns.tr'),
              track: 'minmax(0,1fr)',
              lang: 'tr',
            },
            {
              field: 'freeText',
              label: t('admin.settings.cancelReasons.freeText'),
              track: '11rem',
              kind: 'toggle',
            },
          ]}
        />
      </Section>

      <Section
        level={2}
        title={t('admin.settings.allergens.title')}
        description={t('admin.settings.allergens.description')}
      >
        <ListEditor
          name="allergen_legend"
          rows={form.allergen_legend}
          onChange={(rows) => set('allergen_legend', rows)}
          onAdd={() => addListRow('allergen_legend')}
          focusKey={focusKey}
          errorText={errorText}
          addLabel={t('admin.settings.allergens.add')}
          emptyText={t('admin.settings.allergens.empty')}
          phoneColumns="5.5rem minmax(0,1fr)"
          columns={[
            {
              field: 'code',
              label: t('admin.settings.allergens.code'),
              track: '6rem',
              maxLength: 8,
            },
            {
              field: 'de',
              label: t('admin.settings.columns.de'),
              track: 'minmax(0,1fr)',
              lang: 'de',
            },
            {
              field: 'tr',
              label: t('admin.settings.columns.tr'),
              track: 'minmax(0,1fr)',
              lang: 'tr',
              phoneFull: true,
            },
          ]}
        />
      </Section>

      <SaveBar
        dirty={dirty}
        saving={update.isPending}
        hasErrors={showErrors && Object.keys(errors).length > 0}
        onDiscard={discard}
      />
    </form>
  );
}

/**
 * Yapışkan kayıt çubuğu: ana eylem başparmak bölgesinde, her kaydırma konumunda görünür
 * (DESIGN §5). Durum metni rengin yanında ikonla da söylenir.
 */
function SaveBar({
  dirty,
  saving,
  hasErrors,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  hasErrors: boolean;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:-mx-8 lg:px-8">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3">
        <p role="status" className="flex min-w-0 items-center gap-2">
          {hasErrors ? (
            <>
              <AlertTriangle aria-hidden size={18} className="shrink-0 text-danger-ink" />
              <span className="text-danger-ink">{t('admin.settings.fixErrors')}</span>
            </>
          ) : dirty ? (
            <>
              <CircleDot aria-hidden size={18} className="shrink-0 text-warning" />
              <span>{t('admin.settings.unsaved')}</span>
            </>
          ) : (
            <>
              <CheckCircle2 aria-hidden size={18} className="shrink-0 text-lime" />
              <span className="text-muted">{t('admin.settings.allSaved')}</span>
            </>
          )}
        </p>
        <div className="flex flex-1 justify-end gap-2 sm:flex-none">
          {dirty ? (
            <Button variant="ghost" onClick={onDiscard} disabled={saving} className="px-3">
              {t('admin.settings.discard')}
            </Button>
          ) : null}
          <Button
            type="submit"
            icon={<Save aria-hidden size={20} />}
            loading={saving}
            disabled={!dirty || saving}
            className="max-sm:flex-1"
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ListColumn<R> {
  field: keyof R & string;
  label: string;
  /** Masaüstü ızgara sütunu (`grid-template-columns` parçası). */
  track: string;
  kind?: 'text' | 'toggle';
  maxLength?: number;
  /** Metnin dili: Almanca alan `lang="de"` (büyük harf "İ" tuzağı, BUILD-PROMPT §6). */
  lang?: 'de' | 'tr';
  /** Telefonda satırın tamamını kaplar (`phoneColumns` iki sütunluysa). */
  phoneFull?: boolean;
}

/**
 * JSON listesi düzenleyicisi (hızlı notlar, iptal sebepleri, alerjenler). Masaüstünde her satır
 * bir ızgara satırıdır (başlıklar üstte), telefonda alanlar alt alta dizilir ve her alanın etiketi
 * görünür olur — tablo yok, yatay kayma yok. Sıralama yukarı/aşağı düğmeleriyle (klavye ile de).
 */
function ListEditor<R extends { key: string }>({
  name,
  rows,
  columns,
  onChange,
  onAdd,
  focusKey,
  errorText,
  addLabel,
  emptyText,
  phoneColumns = 'minmax(0,1fr)',
}: {
  name: ListName;
  rows: R[];
  columns: ListColumn<R>[];
  onChange: (rows: R[]) => void;
  onAdd: () => void;
  focusKey: string | null;
  errorText: (key: string) => string | null;
  addLabel: string;
  emptyText: string;
  /**
   * Telefon ızgarası. Varsayılan tek sütun; alerjenlerde kısa kod ile Almanca ad yan yana durur
   * (27 satırlık liste telefonda belirgin kısalır).
   */
  phoneColumns?: string;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  // Başlık ve satırlar ayrı ızgaralardır; hizalı kalmaları için eylem sütunu da sabit genişliktir
  // (iki taşı düğmesi + "Entfernen" — Almanca en uzun metin).
  const template = {
    '--cols': `${columns.map((c) => c.track).join(' ')} ${ACTIONS_TRACK}`,
    '--phone-cols': phoneColumns,
  } as CSSProperties;

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="rounded-control border border-dashed border-border px-4 py-6 text-center text-muted">
          {emptyText}
        </p>
      ) : (
        <>
          <div
            aria-hidden
            style={template}
            className="hidden gap-3 px-1 text-xs font-medium text-muted md:grid md:grid-cols-[var(--cols)]"
          >
            {columns.map((c) => (
              // Anahtar sütununun etiketi satırın kendisinde yazılı; başlıkta boş hücre kalır.
              <span key={c.field}>{c.kind === 'toggle' ? '' : c.label}</span>
            ))}
            <span />
          </div>
          <ol className="flex flex-col gap-3 md:gap-2">
            {rows.map((row, index) => (
              <li
                key={row.key}
                style={template}
                className="grid grid-cols-[var(--phone-cols)] gap-2 rounded-control border border-border p-3 md:grid-cols-[var(--cols)] md:items-start md:gap-3 md:border-0 md:p-0"
              >
                {columns.map((c) => {
                  const inputId = `${baseId}-${row.key}-${c.field}`;
                  const error = errorText(`${name}.${index}.${c.field}`);
                  const value = row[c.field];
                  if (c.kind === 'toggle') {
                    return (
                      <div
                        key={c.field}
                        className="col-span-full md:col-span-1 md:whitespace-nowrap"
                      >
                        <Toggle
                          label={c.label}
                          checked={value === true}
                          onChange={(v) =>
                            onChange(updateRow(rows, index, { [c.field]: v } as Partial<R>))
                          }
                        />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={c.field}
                      className={clsx(
                        'flex min-w-0 flex-col gap-1',
                        c.phoneFull && 'col-span-full md:col-span-1',
                      )}
                    >
                      <label
                        htmlFor={inputId}
                        className="text-xs font-medium text-muted md:sr-only"
                      >
                        {c.label}
                        <span className="sr-only"> · {index + 1}</span>
                      </label>
                      <input
                        id={inputId}
                        lang={c.lang}
                        value={String(value ?? '')}
                        maxLength={c.maxLength ?? LIST_TEXT_MAX}
                        // Yeni eklenen satırın ilk alanına geçiş kullanıcının kendi eylemidir ("… ekle").
                        autoFocus={row.key === focusKey && c === columns[0]}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `${inputId}-error` : undefined}
                        onChange={(e) =>
                          onChange(
                            updateRow(rows, index, { [c.field]: e.target.value } as Partial<R>),
                          )
                        }
                        className={clsx(FIELD, error && 'border-danger')}
                      />
                      {error ? (
                        <p id={`${inputId}-error`} className="text-xs text-danger-ink">
                          {error}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
                <div className="col-span-full flex items-center justify-end gap-1 md:col-span-1">
                  <MoveButtons
                    onUp={() => onChange(moveRow(rows, index, -1))}
                    onDown={() => onChange(moveRow(rows, index, 1))}
                    disabledUp={index === 0}
                    disabledDown={index === rows.length - 1}
                  />
                  <Button
                    variant="ghost"
                    icon={<Trash2 aria-hidden size={18} />}
                    className="px-3"
                    aria-label={t('admin.settings.removeRow', { index: index + 1 })}
                    onClick={() => onChange(removeRow(rows, index))}
                  >
                    {t('common.remove')}
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      <Button
        variant="secondary"
        icon={<Plus aria-hidden size={18} />}
        onClick={onAdd}
        className="self-start"
      >
        {addLabel}
      </Button>
    </div>
  );
}

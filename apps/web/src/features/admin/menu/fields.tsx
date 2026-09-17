import { clsx } from 'clsx';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../../../ui/IconButton';

/**
 * Menü yönetiminin form parçaları. Admin gövde yazısı ≥ 14 px, dokunma hedefleri ≥ 48 px
 * (BUILD-PROMPT §10.6) — masaüstü öncelikli ekran telefonda da kullanılabilir kalır.
 */
export const FIELD =
  'min-h-12 w-full rounded-control border border-border bg-surface-2 px-3 text-sm text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-60';

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  type = 'text',
  placeholder,
  inputClassName,
  disabled,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  hint?: string;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
  inputClassName?: string;
  disabled?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(FIELD, error && 'border-danger', inputClassName)}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(FIELD, 'py-2 leading-relaxed')}
      />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
  disabled,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className={clsx('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value as T)}
        className={clsx(FIELD, 'py-2')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Anahtar: renk tek başına anlam taşımaz, yanında yazı vardır (BUILD-PROMPT §10.3). */
export function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  /** Kapalı anahtarın nedeni `hint` ile yazılır — gri bir kutu tek başına bir şey anlatmaz. */
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-12 items-center gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 disabled:cursor-not-allowed disabled:opacity-50 accent-[var(--lime)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      />
      <label htmlFor={id} className="flex flex-col">
        <span className="text-sm">{label}</span>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </label>
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Sıralama denetimi. `reorder()` sürükle-bırak için yazıldı ama tek yol o değil: yukarı/aşağı
 * düğmeleri klavye ve ekran okuyucuyla da çalışır (WCAG 2.5.7 "Dragging Movements"), sürükleme
 * ise fareyle hızlıdır. İkisi de aynı `reorder()` sonucunu yazar.
 */
export function MoveButtons({
  onUp,
  onDown,
  disabledUp,
  disabledDown,
}: {
  onUp: () => void;
  onDown: () => void;
  disabledUp: boolean;
  disabledDown: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex shrink-0 items-center">
      <IconButton
        label={t('admin.menu.moveUp')}
        icon={<ArrowUp aria-hidden size={18} />}
        disabled={disabledUp}
        onClick={onUp}
        className="disabled:cursor-not-allowed disabled:opacity-40"
      />
      <IconButton
        label={t('admin.menu.moveDown')}
        icon={<ArrowDown aria-hidden size={18} />}
        disabled={disabledDown}
        onClick={onDown}
        className="disabled:cursor-not-allowed disabled:opacity-40"
      />
    </span>
  );
}

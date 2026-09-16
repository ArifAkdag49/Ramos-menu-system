import { Minus, Plus } from 'lucide-react';
import { IconButton } from './IconButton';

/** Adet seçici. Her buton 48 px, sayı tabular ve `aria-live` ile duyurulur. */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  decreaseLabel,
  increaseLabel,
  valueLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  decreaseLabel: string;
  increaseLabel: string;
  valueLabel: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-2 p-1">
      <IconButton
        label={decreaseLabel}
        icon={<Minus aria-hidden size={20} />}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      />
      <span
        aria-live="polite"
        aria-label={valueLabel}
        className="tabular min-w-10 text-center text-lg font-semibold"
      >
        {value}
      </span>
      <IconButton
        label={increaseLabel}
        icon={<Plus aria-hidden size={20} />}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      />
    </div>
  );
}

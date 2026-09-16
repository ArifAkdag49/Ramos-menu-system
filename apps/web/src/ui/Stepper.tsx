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
      {/*
        O7 (M3 tasarım kapısı, axe `aria-prohibited-attr`): sayı jenerik bir `span`'da
        `aria-label="Adet 2"` taşıyordu. ARIA 1.2 jenerik öğede `aria-label`'ı yasaklar; ekran
        okuyucular yok sayar, yani adet değişimi bağlamsız ("2") duyurulurdu. Görünen sayı
        dekoratif, duyuru görünmez bir canlı bölgeden yapılıyor — ikisi de aynı değeri okur.
      */}
      <span className="tabular min-w-10 text-center text-lg font-semibold">
        <span aria-hidden="true">{value}</span>
        <span role="status" className="sr-only">
          {valueLabel}
        </span>
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

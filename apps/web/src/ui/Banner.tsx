import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { TONE_CLASS, type Tone } from './tone';

/**
 * Ekran üstü şerit. Hata için `role="alert"`, bilgi/uyarı için `role="status"`.
 * Metin iki şey söyler: ne oldu ve ne yapılmalı (BUILD-PROMPT §10.9).
 */
export function Banner({
  tone = 'warning',
  icon,
  children,
  action,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={clsx(
        'flex items-center gap-3 rounded-card border px-4 py-3 text-base',
        TONE_CLASS[tone],
        className,
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

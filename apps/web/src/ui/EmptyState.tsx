import type { ReactNode } from 'react';

/** Boş durum yol gösterir: tek cümle + tek eylem (BUILD-PROMPT §10.8). */
export function EmptyState({
  icon,
  title,
  action,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <span className="text-muted">{icon}</span>
      <p className="text-base text-muted">{title}</p>
      {action}
    </div>
  );
}

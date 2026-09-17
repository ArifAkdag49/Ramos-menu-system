import { Ban, Bell, CheckCheck, ChefHat, type LucideIcon } from 'lucide-react';
import type { OrderStatus } from '../../../data/orderMapper';
import type { Tone } from '../../../ui/tone';

/** Garson masa detayıyla aynı renk sözlüğü (spec §8.5); rozette ikon + yazı birlikte durur. */
export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  in_kitchen: 'open',
  ready: 'ready',
  served: 'empty',
  cancelled: 'danger',
};

export const ORDER_STATUS_ICON: Record<OrderStatus, LucideIcon> = {
  in_kitchen: ChefHat,
  ready: Bell,
  served: CheckCheck,
  cancelled: Ban,
};

const TIME = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_TIME = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "19:42" — Europe/Berlin, iki dilde de aynı biçim (BUILD-PROMPT §5). */
export const formatClock = (iso: string): string => TIME.format(new Date(iso));

/** "17.09.2026 19:42" — `de-DE` araya virgül koyar, ekranda tarih biçimi `dd.MM.yyyy HH:mm`. */
export const formatDateTime = (iso: string): string =>
  DATE_TIME.format(new Date(iso)).replace(',', '');

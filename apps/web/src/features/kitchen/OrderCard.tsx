import { formatOrderNo, type Locale } from '@ramos/shared';
import { clsx } from 'clsx';
import { AlertTriangle, Check, Clock, MoreHorizontal, Printer, RotateCw, Timer } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrderItemView, OrderView } from '../../data/orders';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Sheet } from '../../ui/Sheet';
import type { Tone } from '../../ui/tone';
import { Elapsed } from '../common/Elapsed';
import { KDS_BADGE_CLASS, KdsBadge } from './KdsBadge';
import { canUndo, cardElapsed, itemLines, visibleItems, type KitchenTone } from './kitchenLogic';

/**
 * Y6 — gecikme KART DÜZEYİNDE görünür. Önceden yalnız 14 px'lik bir metnin rengi değişiyordu;
 * 38 dk bekleyen kart ile 14 dk bekleyen kart 1–2 m'den ayırt edilemiyordu. Artık kenarlık VE
 * zemin değişiyor (zemin opak bir token, blok opaklık değil — Y2'nin sebebi oydu).
 */
const CARD_BORDER: Record<KitchenTone, string> = {
  ok: 'border-border',
  warn: 'border-warning/70',
  late: 'border-danger',
  ready: 'border-gold/40',
};

/**
 * Kart zemini ayrı durur, çünkü **eylem satırı da aynı zemini taşımak zorunda** (R3): yapışkan
 * eylem satırının altından kalem satırları kayıyor, zemin opak olmazsa metin metnin üstüne biner.
 */
const CARD_SURFACE: Record<KitchenTone, string> = {
  ok: 'bg-surface',
  warn: 'bg-surface-warn',
  late: 'bg-surface-late',
  ready: 'bg-surface',
};

/** Süre kutusunun tonu. KDS'nin opak rozet paleti kullanılır: kart zemini ne olursa olsun sabit. */
const ELAPSED_TONE: Record<KitchenTone, Tone> = {
  ok: 'open',
  warn: 'warning',
  late: 'danger',
  ready: 'ready',
};

/** Renk tek başına anlam taşımaz (§10.5): her tonun kendi ikonu var, `warn`/`late`'in ayrıca yazısı. */
const ELAPSED_ICON: Record<KitchenTone, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  ok: Clock,
  warn: Timer,
  late: AlertTriangle,
  ready: Check,
};

/**
 * Mutfak sipariş kartı. 1–2 m'den okunabilirlik için büyük harf masa adı, ≥ 22 px kalem satırı
 * ve tek ana eylem (HAZIR / Geri al). Masa adı `localTableName` ile çevrilmez — KDS'de fiziksel
 * masa adı (Almanca) olduğu gibi gösterilir (spec §15: KDS hesabının dili ayrı ayarlanır, ama
 * fiziksel tabela/masa adı sabittir); yalnız kalem/seçim metinleri kullanıcı `locale`'ına göre.
 */
export function OrderCard({
  order,
  locale,
  onReady,
  onUndo,
  onReprint,
  onRetry,
  compact = false,
}: {
  order: OrderView;
  locale: Locale;
  onReady: (id: string) => void;
  onUndo: (id: string) => void;
  onReprint: () => void;
  onRetry?: () => void;
  /** "Hazır" sütunundaki küçük kart görünümü (brief Adım 4): daha az yer kaplar, ayrıntı azalır. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);

  // `tone`/`undoable`, ebeveynin (KitchenPage) 15 sn'lik tetikleyicisiyle yeniden hesaplanır —
  // burada ikinci bir zamanlayıcı açılmaz. Süre METNİ ise paylaşılan `Elapsed` bileşeninden gelir
  // (Görev 13, `TablesPage`'de de kullanılan aynı bileşen) — ikinci bir dakika sayacı yazılmaz.
  const now = new Date();
  const { since, tone } = cardElapsed(order, now);
  const undoable = canUndo(order, now);

  return (
    <li
      data-tone={tone}
      className={clsx(
        'flex flex-col gap-2 rounded-card border-2',
        CARD_BORDER[tone],
        CARD_SURFACE[tone],
        compact ? 'p-3' : 'p-4',
      )}
    >
      {/* R3 — süre kutusu KENDİ satırından çıkarılıp başlığın karşısına alındı ve ikincil
          kontroller (EK SİPARİŞ rozeti, "⋯") zaten 64 px olan eylem satırına indi: kart
          651 → ~587 px. Y6'nın kazanımları (30 px süre, kart kenarlığı + zemini, ikon + yazı)
          aynen duruyor. `flex-wrap`: çok uzun masa adında süre kutusu alt satıra iner,
          kırpılmaz. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-col gap-1">
          <span
            lang="de"
            className={clsx('font-extrabold uppercase tracking-tight text-text', compact ? 'text-xl' : 'text-display')}
          >
            {order.table_name.toUpperCase()}
          </span>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="tabular font-semibold text-text">{formatOrderNo(order.order_no)}</span>
            <span aria-hidden>·</span>
            <span>{order.waiter_name}</span>
          </div>
        </div>
        <ElapsedBox since={since} tone={tone} compact={compact} />
      </div>

      {compact ? null : <PrintBadge order={order} onRetry={onRetry} />}

      <ul className="flex flex-col gap-3">
        {visibleItems(order.items).map((item) => (
          <OrderCardItem key={item.id} item={item} locale={locale} compact={compact} />
        ))}
      </ul>

      {/* R3 — eylem satırı kartın İÇİNDE yapışkan. Kartı kısaltmak yetmiyordu: 7 kalemli, 5
          seçenekli, iki turlu bir sipariş 968 px'e çıkıyor ve hiçbir kroma indirimi onu 800 px'lik
          tablete sığdırmıyor. Kalem bilgisini saklamak yerine EYLEMİ kurtarıyoruz — kart ne kadar
          uzun olursa olsun HAZIR (ve "⋯", EK SİPARİŞ rozeti) görünür alanda kalır, aşçı düğmeye
          ulaşmak için kaydırmaz. Kaydırma kabı `KitchenPage`'in sütunu; yapışkan öğe kendi
          kartının sınırlarıyla kısıtlı, yani düğme başka bir kartın üstüne taşmaz.
          Zemin `CARD_SURFACE`: altından kayan kalem satırları düğmenin arkasından geçmez. */}
      <div className={clsx('sticky bottom-0 flex items-center gap-2', CARD_SURFACE[tone])}>
        {order.round_no > 1 ? <KdsBadge tone="warning">{t('kitchen.badge.nachbestellung')}</KdsBadge> : null}
        {order.status === 'in_kitchen' ? (
          <Button
            fullWidth
            size="lg"
            style={compact ? undefined : { minHeight: 64 }}
            className={compact ? undefined : 'text-xl'}
            icon={<Check aria-hidden size={compact ? 20 : 24} />}
            onClick={() => onReady(order.id)}
          >
            {t('kitchen.actions.ready')}
          </Button>
        ) : undoable ? (
          <Button
            fullWidth
            size="lg"
            variant="secondary"
            style={compact ? undefined : { minHeight: 64 }}
            className={compact ? undefined : 'text-xl'}
            icon={<RotateCw aria-hidden size={compact ? 20 : 24} />}
            onClick={() => onUndo(order.id)}
          >
            {t('kitchen.actions.undo')}
          </Button>
        ) : (
          <KdsBadge tone="ready" className={clsx('flex-1 justify-center', compact ? 'min-h-12' : 'min-h-16 text-xl')}>
            {t('kitchen.actions.readyDone')}
          </KdsBadge>
        )}
        {compact ? null : (
          <IconButton
            label={t('kitchen.actions.more')}
            icon={<MoreHorizontal aria-hidden size={22} />}
            onClick={() => setMoreOpen(true)}
          />
        )}
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('kitchen.actions.more')} closeLabel={t('common.close')}>
        <Button
          fullWidth
          icon={<Printer aria-hidden size={20} />}
          onClick={() => {
            setMoreOpen(false);
            onReprint();
          }}
        >
          {t('kitchen.actions.reprint')}
        </Button>
      </Sheet>
    </li>
  );
}

/**
 * Y6 — "hangisi en acil" sorusunun cevabı. Süre 30 px (`text-3xl`), yanında tonun ikonu ve
 * gecikmede/uyarıda ayrıca yazısı var; kutu opak `surface-2` üzerinde durur, böylece kartın
 * zemini değişse bile kontrast sabit kalır. Sayaç METNİ ortak `Elapsed` bileşeninden gelir
 * (reviewer I2 — ikinci bir dakika sayacı yazılmaz).
 *
 * O12 — hazır sütununda `since` artık `ready_at`: "kaç dakikadır tezgâhta". Ne saydığını ekran
 * okuyucuya da söyler; görsel olarak sütun başlığı ve altın ton zaten anlatıyor.
 */
function ElapsedBox({ since, tone, compact }: { since: string; tone: KitchenTone; compact: boolean }) {
  const { t } = useTranslation();
  const Icon = ELAPSED_ICON[tone];
  const label = tone === 'warn' || tone === 'late' ? t(`kitchen.elapsed.${tone}`) : null;

  return (
    <p
      data-tone={tone}
      data-testid="kds-elapsed"
      className={clsx(
        'inline-flex items-center gap-2 rounded-control border font-extrabold',
        KDS_BADGE_CLASS[ELAPSED_TONE[tone]],
        compact ? 'px-2 py-1' : 'px-3 py-1.5',
      )}
    >
      <Icon aria-hidden size={compact ? 18 : 26} />
      <span className="sr-only">{t(tone === 'ready' ? 'kitchen.elapsed.sinceReady' : 'kitchen.elapsed.sinceOrder')}</span>
      <Elapsed since={since} className={clsx('tabular leading-none', compact ? 'text-lg' : 'text-3xl')} />
      {label ? <span className={compact ? 'text-sm' : 'text-base'}>{label}</span> : null}
    </p>
  );
}

function OrderCardItem({ item, locale, compact = false }: { item: OrderItemView; locale: Locale; compact?: boolean }) {
  const { t } = useTranslation();
  const lines = itemLines(item, locale);
  const cancelled = item.status === 'cancelled';

  return (
    // Y2 — blok `opacity` YOK. Kapsayıcı opaklığı `--color-danger-ink`'i de söndürüyordu ve
    // "bunu yapma" sinyali (İPTAL rozeti, 3,77:1) mutfakta en zor okunan şey oluyordu. Sönükleştirme
    // artık amaca uygun tokenla: üstü çizili + `text-muted`; rozet tam opaklıkta kalır.
    <li data-cancelled={cancelled || undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <p
          className={clsx(
            'font-bold leading-snug',
            compact ? 'text-base' : 'text-kds',
            cancelled && 'text-muted line-through',
          )}
        >
          {item.quantity}× {item.product_code ? `${item.product_code} ` : ''}
          {item.product_name}
        </p>
        {cancelled ? <KdsBadge tone="danger">{t('kitchen.badge.storno')}</KdsBadge> : null}
      </div>
      {lines.variant ? <p className={clsx('text-muted', compact ? 'text-sm' : 'text-lg')}>{lines.variant}</p> : null}
      {compact
        ? null
        : lines.options.map((option, i) => (
            <p key={i} className="text-lg text-muted">
              {option}
            </p>
          ))}
      {lines.without ? (
        <p
          data-tone="danger"
          className={clsx(
            'mt-1 inline-block rounded-md bg-danger font-bold text-bg',
            compact ? 'px-1.5 py-0.5 text-sm' : 'px-2 py-1 text-lg',
          )}
        >
          {lines.without}
        </p>
      ) : null}
      {compact || !lines.note ? null : <p className="text-lg font-medium text-warning">{lines.note}</p>}
    </li>
  );
}

function PrintBadge({ order, onRetry }: { order: OrderView; onRetry?: () => void }) {
  const { t } = useTranslation();
  if (!order.print) return null;
  if (order.print.status === 'failed') {
    return (
      <div className="flex items-center gap-2">
        <KdsBadge tone="danger" icon={<Printer aria-hidden size={16} />}>
          {t('status.failed')}
        </KdsBadge>
        {onRetry ? (
          <Button size="md" variant="ghost" icon={<RotateCw aria-hidden size={18} />} onClick={onRetry}>
            {t('common.retry')}
          </Button>
        ) : null}
      </div>
    );
  }
  if (order.print.status === 'pending' || order.print.status === 'printing') {
    return (
      <KdsBadge tone="info" icon={<Printer aria-hidden size={16} />}>
        {t('kitchen.printBadge.queued')}
      </KdsBadge>
    );
  }
  return null;
}

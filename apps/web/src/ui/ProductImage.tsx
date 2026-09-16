import { clsx } from 'clsx';
import { Flame } from 'lucide-react';
import { useState } from 'react';
import { productImageUrl, type ImageSize } from '../lib/images';

// Sabit ölçü: thumb her zaman 56×56 (BUILD-PROMPT §11), full satırın tamamını kaplar. `w-full` ve
// `size-14` gibi genişlik belirleyen sınıflar aynı CSS özelliğini hedeflediğinde Tailwind'in
// katman sırası çağıran `className`'i garanti geçersiz kılmaz; bu yüzden ölçü burada sabitlenir,
// çağıran yalnız aspect-ratio'yu BOZMAYAN ek sınıflar (ör. `max-h-60`) geçer.
const BOX: Record<ImageSize, string> = { thumb: 'size-14 aspect-square', full: 'w-full aspect-[4/3]' };
const DIMENSIONS: Record<ImageSize, { width: number; height: number }> = {
  thumb: { width: 56, height: 56 },
  full: { width: 640, height: 480 },
};

/**
 * Ürün görseli — bulunmaması **normal** durumdur (BUILD-PROMPT §11: seed hiçbir ürüne görsel
 * yazmaz, admin sonradan yükler). Görselli/görselsiz aynı sabit en-boy oranlı kutuyu kullanır ki
 * görsel gelince düzen kaymasın (DESIGN.md §9).
 */
export function ProductImage({
  path,
  size,
  code,
  alt,
  className,
}: {
  path: string | null;
  size: ImageSize;
  code: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = productImageUrl(path, size);
  const dim = DIMENSIONS[size];

  return (
    <div className={clsx('relative shrink-0 overflow-hidden rounded-card bg-surface-2', BOX[size], className)}>
      {url && !failed ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={dim.width}
          height={dim.height}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          data-testid="product-image-placeholder"
          aria-hidden="true"
          className="flex size-full flex-col items-center justify-center gap-1 border border-border"
        >
          <Flame className="text-gold/70" size={size === 'thumb' ? 20 : 32} />
          {code ? <span className="tabular text-[10px] font-medium text-muted">{code}</span> : null}
        </div>
      )}
    </div>
  );
}

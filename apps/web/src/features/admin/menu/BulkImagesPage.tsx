import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { CheckCircle2, ImagePlus, Upload } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminMenu, type AdminProduct } from '../../../data/adminMenu';
import { qk } from '../../../data/keys';
import { toast } from '../../../lib/toast';
import { Button } from '../../../ui/Button';
import { ProductImage } from '../../../ui/ProductImage';
import { Spinner } from '../../../ui/Spinner';
import { matchFilesToProducts, uploadProductImage, validateImageFile } from './imageUpload';
import { Section } from './fields';

const ACCEPT = 'image/jpeg,image/png,image/webp';

interface Progress {
  done: number;
  total: number;
  failed: number;
}

/**
 * Menü > Toplu görsel yükleme. Kural tek cümle: **dosya adını ürün numarası yap**. Eşleşme önce
 * gösterilir, sonra yüklenir — 100 dosyayı körlemesine göndermek, yanlış ürüne düşen görselleri
 * tek tek aramakla biterdi.
 *
 * Dosyalar **sırayla** yüklenir: her dosya iki WebP kodlaması + iki Storage isteği demek; hepsini
 * aynı anda başlatmak restoranın yükleme hattını tıkar ve ilerleme çubuğu anlamını yitirir.
 */
export function BulkImagesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { products, isPending } = useAdminMenu();
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [summary, setSummary] = useState<Progress | null>(null);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const result = useMemo(() => matchFilesToProducts(files, products), [files, products]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted = [...list].filter((f) => validateImageFile(f) === null);
    const rejected = list.length - accepted.length;
    setFiles((prev) => [...prev, ...accepted]);
    setSummary(null);
    if (rejected > 0) toast(t('admin.menu.images.rejected', { count: rejected }), 'warning');
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const upload = async () => {
    const total = result.matched.length;
    setProgress({ done: 0, total, failed: 0 });
    let done = 0;
    let failed = 0;
    for (const m of result.matched) {
      const product = byId.get(m.productId);
      if (product) {
        try {
          await uploadProductImage(product, m.file);
          done += 1;
        } catch {
          failed += 1;
        }
      } else {
        failed += 1;
      }
      setProgress({ done, total, failed });
    }
    setProgress(null);
    setSummary({ done, total, failed });
    setFiles([]);
    if (inputRef.current) inputRef.current.value = '';
    void queryClient.invalidateQueries({ queryKey: qk.menu });
  };

  if (isPending) {
    return (
      <p className="flex items-center justify-center gap-2 px-4 py-10 text-muted">
        <Spinner label={t('common.loading')} />
        <span>{t('common.loading')}</span>
      </p>
    );
  }

  const busy = progress !== null;

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-card border border-info/40 bg-info/10 px-4 py-3 text-sm text-info">
        {t('admin.menu.images.rule')}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr-only"
        aria-label={t('admin.menu.images.choose')}
        onChange={(e) => addFiles(e.target.files)}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={clsx(
          'flex flex-col items-center gap-3 rounded-card border border-dashed px-4 py-8 text-center',
          dragging ? 'border-lime bg-lime/10' : 'border-border bg-surface-2',
        )}
      >
        <p className="text-sm text-muted">{t('admin.menu.images.dropHint')}</p>
        <Button
          variant="secondary"
          icon={<ImagePlus aria-hidden size={18} />}
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {t('admin.menu.images.choose')}
        </Button>
      </div>

      {summary ? (
        <p
          role="status"
          className="flex items-center gap-2 rounded-card border border-lime/40 bg-lime/10 px-4 py-3 text-sm text-lime"
        >
          <CheckCircle2 aria-hidden size={18} />
          {t('admin.menu.images.summary', { done: summary.done, failed: summary.failed })}
        </p>
      ) : null}

      {progress ? (
        <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
          <p className="text-sm">{t('admin.menu.images.uploadingN', { done: progress.done, total: progress.total })}</p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-label={t('admin.menu.images.progressLabel')}
            className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className="h-full bg-lime transition-[width] duration-200"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      ) : null}

      {files.length > 0 ? (
        <>
          <Section
            title={t('admin.menu.images.matched', { count: result.matched.length })}
            action={
              <Button
                icon={<Upload aria-hidden size={20} />}
                loading={busy}
                disabled={result.matched.length === 0}
                onClick={() => void upload()}
              >
                {t('admin.menu.images.upload')}
              </Button>
            }
          >
            {result.matched.length === 0 ? (
              <p className="text-xs text-muted">{t('admin.menu.images.noMatch')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {result.matched.map((m) => {
                  const product = byId.get(m.productId) as AdminProduct | undefined;
                  return (
                    <li key={m.file.name} className="flex items-center gap-3 py-2">
                      <ProductImage path={product?.image_path ?? null} size="thumb" code={product?.code ?? null} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{product?.name}</span>
                        <span className="tabular block truncate text-xs text-muted">
                          {m.file.name} → {product?.code ?? '—'}
                        </span>
                      </span>
                      {product?.image_path ? (
                        <span className="shrink-0 text-xs text-warning">{t('admin.menu.images.willReplace')}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {result.unmatched.length > 0 ? (
            <Section title={t('admin.menu.images.unmatched', { count: result.unmatched.length })}>
              <ul className="flex flex-col gap-1">
                {result.unmatched.map((f) => (
                  <li key={f.name} className="tabular text-xs text-danger-ink">
                    {f.name}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">{t('admin.menu.images.unmatchedHint')}</p>
            </Section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

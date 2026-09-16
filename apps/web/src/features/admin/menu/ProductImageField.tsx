import { clsx } from 'clsx';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../ui/Button';
import { ProductImage } from '../../../ui/ProductImage';
import { Spinner } from '../../../ui/Spinner';
import { removeProductImage, uploadProductImage, validateImageFile } from './imageUpload';

const ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Ürün editöründeki "Görsel" bölümü. Görsel **yoksa** bu bir hata değildir: seed hiçbir ürüne
 * görsel yazmaz, kullanıcı sonradan ekler (BUILD-PROMPT §11). Bu yüzden boş hâl bir uyarı değil,
 * davetkâr bir bırakma alanıdır.
 *
 * Görselli ve görselsiz düzen aynı sabit en-boy oranlı kutuyu kullanır — görsel gelince sayfa
 * kaymaz (§10.11).
 */
export function ProductImageField({
  product,
  onChanged,
}: {
  product: { id: string; code: string | null; image_path: string | null };
  onChanged: (path: string | null) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      setError(t(`admin.menu.image.error.${problem}`));
      return;
    }
    setError(null);
    setBusy('upload');
    try {
      const path = await uploadProductImage(product, file);
      onChanged(path);
    } catch {
      setError(t('admin.menu.image.error.failed'));
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    setConfirmRemove(false);
    setError(null);
    setBusy('remove');
    try {
      await removeProductImage(product);
      onChanged(null);
    } catch {
      setError(t('admin.menu.image.error.failed'));
    } finally {
      setBusy(null);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    void handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label={t('admin.menu.image.choose')}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {product.image_path ? (
        <div className="flex flex-wrap items-start gap-4">
          <ProductImage path={product.image_path} size="full" code={product.code} className="max-w-64" />
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              icon={<Upload aria-hidden size={18} />}
              loading={busy === 'upload'}
              disabled={busy !== null}
              onClick={() => inputRef.current?.click()}
            >
              {t('admin.menu.image.replace')}
            </Button>
            {confirmRemove ? (
              <div className="flex flex-col gap-2 rounded-card border border-danger/40 bg-danger/10 p-3">
                <p className="text-xs text-danger-ink">{t('admin.menu.image.removeConfirm')}</p>
                <div className="flex gap-2">
                  <Button variant="danger" loading={busy === 'remove'} onClick={() => void handleRemove()}>
                    {t('admin.menu.image.remove')}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                icon={<Trash2 aria-hidden size={18} />}
                disabled={busy !== null}
                onClick={() => setConfirmRemove(true)}
              >
                {t('admin.menu.image.remove')}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={clsx(
            'flex flex-col items-center gap-3 rounded-card border border-dashed px-4 py-6 text-center',
            dragging ? 'border-lime bg-lime/10' : 'border-border bg-surface-2',
          )}
        >
          {busy === 'upload' ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner label={t('admin.menu.image.uploading')} />
              <span>{t('admin.menu.image.uploading')}</span>
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">{t('admin.menu.image.dropHint')}</p>
              <Button
                variant="secondary"
                icon={<ImagePlus aria-hidden size={18} />}
                onClick={() => inputRef.current?.click()}
              >
                {t('admin.menu.image.choose')}
              </Button>
              <p className="text-xs text-muted">{t('admin.menu.image.laterNote')}</p>
            </>
          )}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

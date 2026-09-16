import { AlertTriangle, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';

/**
 * R75: sepet satırının ürünü menüde yoksa (admin arşivlemiş/pasifleştirmiş) satır **gizlenmez**.
 * Gizlendiği hâlde `toSubmitItems` onu yine de gönderiyordu: sunucu `product_*` hatası dönüyor,
 * hata doğru satırı işaretliyor ama satır ekranda olmadığı için "Sil" hiç görünmüyor — garsonun
 * tek çıkışı tarayıcı deposunu temizlemek oluyordu. Kullanıcı görmediği bir şeyi gönderemez.
 *
 * Ürün adı bilinmediği için kimliğin kısa hâli gösterilir; garsona anlamı yok ama iki aynı
 * görünen satırı ayırt etmeye ve destekte konuşmaya yarar.
 */
export function MissingProductLine({ productId, onRemove }: { productId: string; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <li
      data-testid="missing-product-line"
      className="flex flex-col gap-3 rounded-card border border-danger bg-danger/10 p-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle aria-hidden size={20} className="mt-0.5 shrink-0 text-danger-ink" />
        <div className="min-w-0">
          <p className="text-base font-semibold text-danger-ink">{t('waiter.cart.unknownProduct')}</p>
          <p className="tabular text-xs text-muted">{productId.slice(0, 8)}</p>
        </div>
      </div>
      <Button variant="danger" icon={<Trash2 aria-hidden size={18} />} onClick={onRemove}>
        {t('common.remove')}
      </Button>
    </li>
  );
}

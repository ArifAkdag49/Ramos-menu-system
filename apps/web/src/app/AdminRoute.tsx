import { lazy, Suspense } from 'react';
import { BrandLoader } from './BrandLoader';

/**
 * Görev 27: admin bölümü ayrı JS parçası (`features/admin/AdminApp.tsx`). `router.tsx` bunu
 * `RoleGate`'in içinde çizer: garson ve mutfak ekranlarının açılışında admin kodu indirilip
 * çalıştırılmaz, ana paket küçülür. (Service worker parçayı arka planda önbelleğe yine alır —
 * yeni sürüm yayınlandığında açık kalmış eski bir admin sekmesi sunucuda artık olmayan parçayı
 * isteyip boş ekran vermesin.)
 */
const AdminApp = lazy(() => import('../features/admin/AdminApp'));

export function AdminRoute() {
  return (
    <Suspense fallback={<BrandLoader />}>
      <AdminApp />
    </Suspense>
  );
}

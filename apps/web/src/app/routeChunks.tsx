import { lazy, Suspense, type ReactNode } from 'react';
import { BrandLoader } from './BrandLoader';

/**
 * Ekran bölümlerinin tembel yüklenen sarmalayıcıları. `router.tsx` bunları çizer; her bölüm ayrı
 * bir JS parçasıdır ve yalnız o adrese girilince ağdan alınır.
 *
 * Gerekçe (R94): açılış paketi tek parçada 913 kB'a çıkmıştı ve ucuz Android telefonda yalnız
 * okunup çözümlenmesi ~0,8 sn sürüyordu. Garson telefonu mutfak ekranını, mutfak tableti garson
 * sekmelerini, ikisi de müşteri QR menüsünü hiç açmaz — bu kodun açılışta çözümlenmesi için bir
 * sebep yok. Giriş ekranı (`LoginPage`) bilinçli olarak parçalanmaz: ilk çizilen ekran odur,
 * onu ikinci bir ağ isteğinin arkasına koymak açılışı yavaşlatırdı.
 *
 * Yetki kontrolü parçadan ÖNCE çalışır: `router.tsx` bu bileşenleri `RoleGate`'in **içinde**
 * çizer, yani rolü uymayan cihaz parçayı indirmeden yönlendirilir.
 *
 * (Service worker parçaları arka planda önbelleğe yine alır — yeni sürüm yayınlandığında açık
 * kalmış eski bir sekme sunucuda artık olmayan parçayı isteyip boş ekran vermesin.)
 */

/** Parça ağdan gelirken boş ekran yerine marka yükleyicisi; bölümlerin tamamı aynı bekleyişi paylaşır. */
const Chunk = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<BrandLoader />}>{children}</Suspense>
);

const AdminApp = lazy(() => import('../features/admin/AdminApp'));
const WaiterApp = lazy(() => import('../features/waiter/WaiterApp'));
const KitchenPage = lazy(() =>
  import('../features/kitchen/KitchenPage').then((m) => ({ default: m.KitchenPage })),
);
const PublicMenuPage = lazy(() =>
  import('../features/publicMenu/PublicMenuPage').then((m) => ({ default: m.PublicMenuPage })),
);

/** Garson bölümü (`features/waiter/WaiterApp.tsx`): sekmeler + sipariş girişi. */
export const WaiterRoute = () => (
  <Chunk>
    <WaiterApp />
  </Chunk>
);

/** Mutfak ekranı (KDS) — garson telefonunda hiç açılmaz. */
export const KitchenRoute = () => (
  <Chunk>
    <KitchenPage />
  </Chunk>
);

/** Müşteri QR menüsü — personelin hiçbir cihazında açılmaz. */
export const PublicMenuRoute = () => (
  <Chunk>
    <PublicMenuPage />
  </Chunk>
);

/** Yönetim bölümü (Görev 27'den beri ayrı parça; alt rotalar `features/admin/AdminApp.tsx`'te). */
export const AdminRoute = () => (
  <Chunk>
    <AdminApp />
  </Chunk>
);

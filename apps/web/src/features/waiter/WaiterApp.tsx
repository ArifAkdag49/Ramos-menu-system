import { Route, Routes } from 'react-router';
import { HomeRedirect } from '../../app/pages';
import { OrderPage } from './OrderPage';
import { ProfilePage } from './ProfilePage';
import { ReadyPage } from './ReadyPage';
import { TableDetailPage } from './TableDetailPage';
import { TablesPage } from './TablesPage';
import { WaiterLayout } from './WaiterLayout';

/**
 * Garson bölümünün tamamı — ayrı JS parçası (R94, `app/routeChunks.tsx` bunu `React.lazy` ile
 * `RoleGate`'in içinde yükler). Mutfak tableti ve müşteri menüsü açılışında masa ızgarası, sipariş
 * girişi, sepet ve hesap kodu indirilip çözümlenmez.
 *
 * Rotalar `/waiter/*` altında göreli yazılır; ekranlardaki bağlantılar zaten mutlak (`/waiter/ready`).
 * Düzen (`WaiterLayout`) ortak üst bar, bağlantı şeritleri ve alt gezinmeyi paylaşır; sipariş girişi
 * (Görev 14) bu düzenin **dışındadır** — tam ekran çalışır. `table/:tableId/order` daha belirgin
 * olduğu için `table/:tableId`'den önce eşleşir (react-router sırayı değil belirginliği kullanır).
 *
 * Bilinmeyen bir garson adresi, eskiden üst düzey `*` rotasının yaptığı gibi rolün ana ekranına döner.
 */
export default function WaiterApp() {
  return (
    <Routes>
      <Route element={<WaiterLayout />}>
        <Route index element={<TablesPage />} />
        <Route path="table/:tableId" element={<TableDetailPage />} />
        <Route path="ready" element={<ReadyPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="table/:tableId/order" element={<OrderPage />} />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

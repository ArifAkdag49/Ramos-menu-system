import { Navigate, Route, Routes } from 'react-router';
import { AdminLayout } from './AdminLayout';
import { AuditLogPage } from './AuditLogPage';
import { DashboardPage } from './DashboardPage';
import { BulkAssignPage } from './menu/BulkAssignPage';
import { BulkImagesPage } from './menu/BulkImagesPage';
import { CategoriesPage } from './menu/CategoriesPage';
import { IngredientsPage } from './menu/IngredientsPage';
import { MenuLayout } from './menu/MenuLayout';
import { OptionGroupsPage } from './menu/OptionGroupsPage';
import { ProductsPage } from './menu/ProductsPage';
import { OrdersPage } from './orders/OrdersPage';
import { ReportsPage } from './reports/ReportsPage';
import { SettingsPage } from './settings/SettingsPage';
import { StaffPage } from './staff/StaffPage';
import { TablesAdminPage } from './tables/TablesAdminPage';

/**
 * Admin bölümünün tamamı — ayrı JS parçası (Görev 27, Plan 5 Adım 2.4). `app/AdminRoute.tsx` bunu
 * `React.lazy` ile `RoleGate`'in **içinde** yükler: garson ve mutfak ekranları açılırken admin kodu
 * (menü editörü, raporlar, CSV, personel yönetimi…) indirilip çalıştırılmaz, ana paket küçülür.
 *
 * Rotalar `/admin/*` altında göreli yazılır; ekranlardaki bağlantılar zaten mutlak (`/admin/menu`).
 * Bilinmeyen bir admin adresi, eskiden üst düzey `*` rotasının yaptığı gibi `/admin`'e döner.
 */
export default function AdminApp() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="menu" element={<MenuLayout />}>
          <Route index element={<ProductsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="ingredients" element={<IngredientsPage />} />
          <Route path="groups" element={<OptionGroupsPage />} />
          <Route path="bulk" element={<BulkAssignPage />} />
          <Route path="images" element={<BulkImagesPage />} />
        </Route>
        <Route path="staff" element={<StaffPage />} />
        <Route path="tables" element={<TablesAdminPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}

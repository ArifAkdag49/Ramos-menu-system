import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { AdminLayout } from '../features/admin/AdminLayout';
import { AuditLogPage } from '../features/admin/AuditLogPage';
import { DashboardPage } from '../features/admin/DashboardPage';
import { BulkAssignPage } from '../features/admin/menu/BulkAssignPage';
import { BulkImagesPage } from '../features/admin/menu/BulkImagesPage';
import { CategoriesPage } from '../features/admin/menu/CategoriesPage';
import { IngredientsPage } from '../features/admin/menu/IngredientsPage';
import { MenuLayout } from '../features/admin/menu/MenuLayout';
import { OptionGroupsPage } from '../features/admin/menu/OptionGroupsPage';
import { OrdersPage } from '../features/admin/orders/OrdersPage';
import { ProductsPage } from '../features/admin/menu/ProductsPage';
import { StaffPage } from '../features/admin/staff/StaffPage';
import { TablesAdminPage } from '../features/admin/tables/TablesAdminPage';
import { LoginPage } from '../features/auth/LoginPage';
import { KitchenPage } from '../features/kitchen/KitchenPage';
import { OrderPage } from '../features/waiter/OrderPage';
import { ProfilePage } from '../features/waiter/ProfilePage';
import { ReadyPage } from '../features/waiter/ReadyPage';
import { TableDetailPage } from '../features/waiter/TableDetailPage';
import { TablesPage } from '../features/waiter/TablesPage';
import { WaiterLayout } from '../features/waiter/WaiterLayout';
import type { Role } from '../lib/auth';
import { AdminReportsPage, AdminSettingsPage, HomeRedirect } from './pages';
import { RoleGate } from './RoleGate';

const gate = (roles: Role[], element: ReactNode) => <RoleGate roles={roles}>{element}</RoleGate>;

const WAITER: Role[] = ['waiter', 'admin'];
const KITCHEN: Role[] = ['kitchen', 'admin'];
const ADMIN: Role[] = ['admin'];

/** Rotalar BUILD-PROMPT §5'teki gibidir. Garson sekmeleri (`WaiterLayout`) ortak üst bar,
 * bağlantı şeritleri ve alt gezinmeyi paylaşır; sipariş girişi (Görev 14) bu düzenin dışındadır. */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },

  {
    path: '/waiter',
    element: gate(WAITER, <WaiterLayout />),
    children: [
      { index: true, element: <TablesPage /> },
      { path: 'table/:tableId', element: <TableDetailPage /> },
      { path: 'ready', element: <ReadyPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
  { path: '/waiter/table/:tableId/order', element: gate(WAITER, <OrderPage />) },

  { path: '/kitchen', element: gate(KITCHEN, <KitchenPage />) },

  {
    path: '/admin',
    element: gate(ADMIN, <AdminLayout />),
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: 'menu',
        element: <MenuLayout />,
        children: [
          { index: true, element: <ProductsPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'ingredients', element: <IngredientsPage /> },
          { path: 'groups', element: <OptionGroupsPage /> },
          { path: 'bulk', element: <BulkAssignPage /> },
          { path: 'images', element: <BulkImagesPage /> },
        ],
      },
      { path: 'staff', element: <StaffPage /> },
      { path: 'tables', element: <TablesAdminPage /> },
      { path: 'orders', element: <OrdersPage /> },
      { path: 'audit', element: <AuditLogPage /> },
      { path: 'reports', element: <AdminReportsPage /> },
      { path: 'settings', element: <AdminSettingsPage /> },
    ],
  },

  { path: '/', element: <HomeRedirect /> },
  { path: '*', element: <HomeRedirect /> },
]);

import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { ProfilePage } from '../features/waiter/ProfilePage';
import { ReadyPage } from '../features/waiter/ReadyPage';
import { TableDetailPage } from '../features/waiter/TableDetailPage';
import { TablesPage } from '../features/waiter/TablesPage';
import { WaiterLayout } from '../features/waiter/WaiterLayout';
import type { Role } from '../lib/auth';
import {
  AdminDashboardPage,
  AdminMenuPage,
  AdminOrdersPage,
  AdminReportsPage,
  AdminSettingsPage,
  AdminStaffPage,
  AdminTablesPage,
  HomeRedirect,
  KitchenPage,
  WaiterOrderPage,
} from './pages';
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
  { path: '/waiter/table/:tableId/order', element: gate(WAITER, <WaiterOrderPage />) },

  { path: '/kitchen', element: gate(KITCHEN, <KitchenPage />) },

  { path: '/admin', element: gate(ADMIN, <AdminDashboardPage />) },
  { path: '/admin/menu/*', element: gate(ADMIN, <AdminMenuPage />) },
  { path: '/admin/staff', element: gate(ADMIN, <AdminStaffPage />) },
  { path: '/admin/tables', element: gate(ADMIN, <AdminTablesPage />) },
  { path: '/admin/orders', element: gate(ADMIN, <AdminOrdersPage />) },
  { path: '/admin/reports', element: gate(ADMIN, <AdminReportsPage />) },
  { path: '/admin/settings', element: gate(ADMIN, <AdminSettingsPage />) },

  { path: '/', element: <HomeRedirect /> },
  { path: '*', element: <HomeRedirect /> },
]);

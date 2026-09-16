import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { LoginPage } from '../features/auth/LoginPage';
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
  WaiterProfilePage,
  WaiterReadyPage,
  WaiterTablePage,
  WaiterTablesPage,
} from './pages';
import { RoleGate } from './RoleGate';

const gate = (roles: Role[], element: ReactNode) => <RoleGate roles={roles}>{element}</RoleGate>;

const WAITER: Role[] = ['waiter', 'admin'];
const KITCHEN: Role[] = ['kitchen', 'admin'];
const ADMIN: Role[] = ['admin'];

/** Rotalar BUILD-PROMPT §5'teki gibidir. */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },

  { path: '/waiter', element: gate(WAITER, <WaiterTablesPage />) },
  { path: '/waiter/table/:tableId', element: gate(WAITER, <WaiterTablePage />) },
  { path: '/waiter/table/:tableId/order', element: gate(WAITER, <WaiterOrderPage />) },
  { path: '/waiter/ready', element: gate(WAITER, <WaiterReadyPage />) },
  { path: '/waiter/profile', element: gate(WAITER, <WaiterProfilePage />) },

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

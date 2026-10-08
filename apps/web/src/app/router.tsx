import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { LoginPage } from '../features/auth/LoginPage';
import type { Role } from '../lib/auth';
import { HomeRedirect } from './pages';
import { RoleGate } from './RoleGate';
import { AdminRoute, KitchenRoute, PublicMenuRoute, WaiterRoute } from './routeChunks';

const gate = (roles: Role[], element: ReactNode) => <RoleGate roles={roles}>{element}</RoleGate>;

const WAITER: Role[] = ['waiter', 'admin'];
const KITCHEN: Role[] = ['kitchen', 'admin'];
const ADMIN: Role[] = ['admin'];

/** Rotalar BUILD-PROMPT §5'teki gibidir. Garson, mutfak, müşteri menüsü ve yönetim bölümlerinin
 * her biri ayrı bir JS parçasıdır (R94 — `routeChunks.tsx`); yalnız giriş ekranı açılış paketinde
 * durur. Alt rotalar bölümün kendi içindedir (`features/waiter/WaiterApp.tsx`,
 * `features/admin/AdminApp.tsx`), böylece bir bölüme girildiğinde tek parça yeter. */
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },

  // Müşteri QR menüsü: girişsiz, `RoleGate` dışında. Oturum ve rol aranmaz.
  { path: '/menu', element: <PublicMenuRoute /> },

  // `RoleGate` önce çalışır: parça yalnız rolü uyan oturumda indirilir.
  { path: '/waiter/*', element: gate(WAITER, <WaiterRoute />) },

  { path: '/kitchen', element: gate(KITCHEN, <KitchenRoute />) },

  { path: '/admin/*', element: gate(ADMIN, <AdminRoute />) },

  { path: '/', element: <HomeRedirect /> },
  { path: '*', element: <HomeRedirect /> },
]);

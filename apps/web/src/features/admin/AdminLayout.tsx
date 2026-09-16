import { clsx } from 'clsx';
import {
  BarChart3,
  BookOpen,
  ChefHat,
  ClipboardList,
  ConciergeBell,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  Settings,
  Users,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { IconButton } from '../../ui/IconButton';
import { Sheet } from '../../ui/Sheet';
import { ToastHost } from '../../ui/ToastHost';
import { ConnectionBanners } from '../common/ConnectionBanners';

interface NavItem {
  to: string;
  labelKey:
    | 'admin.dashboard.title'
    | 'admin.menu.title'
    | 'admin.staff.title'
    | 'admin.tables.title'
    | 'admin.orders.title'
    | 'admin.reports.title'
    | 'admin.settings.title';
  icon: ReactNode;
  end?: boolean;
}

const SECTIONS: NavItem[] = [
  { to: '/admin', labelKey: 'admin.dashboard.title', icon: <LayoutDashboard aria-hidden size={20} />, end: true },
  { to: '/admin/menu', labelKey: 'admin.menu.title', icon: <BookOpen aria-hidden size={20} /> },
  { to: '/admin/staff', labelKey: 'admin.staff.title', icon: <Users aria-hidden size={20} /> },
  { to: '/admin/tables', labelKey: 'admin.tables.title', icon: <LayoutGrid aria-hidden size={20} /> },
  { to: '/admin/orders', labelKey: 'admin.orders.title', icon: <ClipboardList aria-hidden size={20} /> },
  { to: '/admin/reports', labelKey: 'admin.reports.title', icon: <BarChart3 aria-hidden size={20} /> },
  { to: '/admin/settings', labelKey: 'admin.settings.title', icon: <Settings aria-hidden size={20} /> },
];

/**
 * Admin iskeleti. Masaüstünde (≥ lg) sabit sol menü, telefonda üst çubuk + soldan açılan çekmece
 * (`adaptive-navigation`; çekmece `ui/Sheet`'in odak kapanı, `Esc` ve `inert` davranışını aynen
 * kullanır). Gövde yazısı adminde ≥ 14 px (BUILD-PROMPT §10.6).
 *
 * Realtime aboneliği `<ConnectionBanners>` içinde açılır — garson ve mutfakta olduğu gibi tek
 * kaynak odur, burada ikinci kez `useBroadcastInvalidation` çağrılmaz.
 */
export function AdminLayout() {
  const { t } = useTranslation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-dvh text-sm lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-[var(--header-h)] shrink-0 items-center px-5 text-lg font-semibold">RAMO&apos;S</div>
        <AdminNav />
      </aside>

      <header className="sticky top-0 z-10 flex h-[var(--header-h)] items-center gap-2 border-b border-border bg-surface px-2 lg:hidden">
        <IconButton
          label={t('admin.nav.open')}
          icon={<Menu aria-hidden size={24} />}
          onClick={() => setDrawerOpen(true)}
        />
        <span className="truncate text-lg font-semibold">RAMO&apos;S</span>
      </header>

      <Sheet
        open={drawerOpen}
        side="left"
        onClose={closeDrawer}
        title={t('admin.nav.label')}
        closeLabel={t('common.close')}
      >
        {/* Bağlantıya dokununca çekmece kapanır; hedef ekran panelin arkasında kalmaz. */}
        <AdminNav onNavigate={closeDrawer} />
      </Sheet>

      <ConnectionBanners topics={['orders', 'menu', 'print-jobs', 'printer-status', 'settings']} />

      <main className="px-4 pb-12 pt-4 lg:px-8">
        <Outlet />
      </main>

      <ToastHost />
    </div>
  );
}

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('admin.nav.label')} className="flex flex-col gap-1 overflow-y-auto px-3 pb-6">
      {SECTIONS.map((s) => (
        <AdminNavLink key={s.to} to={s.to} end={s.end} icon={s.icon} label={t(s.labelKey)} onNavigate={onNavigate} />
      ))}

      <p className="mt-6 px-3 pb-1 text-xs font-semibold text-muted">{t('admin.nav.shortcuts')}</p>
      <AdminNavLink
        to="/waiter"
        icon={<ConciergeBell aria-hidden size={20} />}
        label={t('admin.nav.waiter')}
        onNavigate={onNavigate}
      />
      <AdminNavLink
        to="/kitchen"
        icon={<ChefHat aria-hidden size={20} />}
        label={t('admin.nav.kitchen')}
        onNavigate={onNavigate}
      />
    </nav>
  );
}

function AdminNavLink({
  to,
  end,
  icon,
  label,
  onNavigate,
}: {
  to: string;
  end?: boolean;
  icon: ReactNode;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          'flex min-h-12 items-center gap-3 rounded-control px-3 font-medium',
          'transition-colors duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          isActive ? 'bg-lime/15 text-lime' : 'text-muted hover:bg-surface-2 hover:text-text',
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

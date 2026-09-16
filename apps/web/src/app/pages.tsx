import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { homeFor, useAuth } from '../lib/auth';

/**
 * Görev 13–16 ve 21'de tamamen değiştirilecek yer tutucu ekranlar.
 * Şimdilik yalnız başlığı gösterirler; başlıklar i18n'den gelir.
 */
function Screen({ title }: { title: string }) {
  return (
    <main className="min-h-dvh px-4 py-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
    </main>
  );
}

export function WaiterTablesPage() {
  const { t } = useTranslation();
  return <Screen title={t('waiter.tables.title')} />;
}

export function WaiterTablePage() {
  const { t } = useTranslation();
  return <Screen title={t('waiter.table.title')} />;
}

export function WaiterOrderPage() {
  const { t } = useTranslation();
  return <Screen title={t('waiter.order.title')} />;
}

export function WaiterReadyPage() {
  const { t } = useTranslation();
  return <Screen title={t('waiter.ready.title')} />;
}

export function WaiterProfilePage() {
  const { t } = useTranslation();
  return <Screen title={t('waiter.profile.title')} />;
}

export function KitchenPage() {
  const { t } = useTranslation();
  return <Screen title={t('kitchen.title')} />;
}

export function AdminDashboardPage() {
  const { t } = useTranslation();
  return <Screen title={t('admin.dashboard.title')} />;
}

export function AdminMenuPage() {
  const { t } = useTranslation();
  return <Screen title={t('admin.menu.title')} />;
}

export function AdminStaffPage() {
  const { t } = useTranslation();
  return <Screen title={t('admin.staff.title')} />;
}

export function AdminTablesPage() {
  const { t } = useTranslation();
  return <Screen title={t('admin.tables.title')} />;
}

export function AdminOrdersPage() {
  const { t } = useTranslation();
  return <Screen title={t('admin.orders.title')} />;
}

export function AdminReportsPage() {
  const { t } = useTranslation();
  return <Screen title={t('admin.reports.title')} />;
}

export function AdminSettingsPage() {
  const { t } = useTranslation();
  return <Screen title={t('admin.settings.title')} />;
}

/** `/` ve bilinmeyen adresler: oturum varsa rolün ana ekranına, yoksa girişe. */
export function HomeRedirect() {
  const profile = useAuth((s) => s.profile);
  return <Navigate to={profile ? homeFor(profile.role) : '/login'} replace />;
}

import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { homeFor, useAuth } from '../lib/auth';

/**
 * Görev 21'de tamamen değiştirilecek yer tutucu admin ekranları. Şimdilik yalnız başlığı
 * gösterirler; başlıklar i18n'den gelir. Garson sekmeleri (Masalar, Masa detayı, Hazır, Profil,
 * Sipariş girişi) Görev 13/14'te `features/waiter/*`'a, mutfak ekranı Görev 16'da
 * `features/kitchen/KitchenPage`'e taşındı.
 */
function Screen({ title }: { title: string }) {
  return (
    <main className="min-h-dvh px-4 py-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
    </main>
  );
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

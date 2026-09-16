import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { homeFor, useAuth } from '../lib/auth';

/**
 * Henüz yazılmamış admin bölümleri için yer tutucu. Görev 21'de kabuk (`AdminLayout`) ve canlı
 * durum ekranı (`features/admin/DashboardPage`), Görev 22'de menü yönetimi
 * (`features/admin/menu/*`) gerçek hâllerini aldı; kalanlar Görev 23-26'da doldurulacak. Başlık dışında bir şey göstermezler ve `AdminLayout`'un `<main>`'i içinde
 * çizildikleri için kendi sayfa kabuklarını kurmazlar.
 */
function Screen({ title }: { title: string }) {
  return <h1 className="text-2xl font-semibold">{title}</h1>;
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

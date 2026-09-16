import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';

interface Tab {
  to: string;
  key:
    | 'admin.menu.tabs.products'
    | 'admin.menu.tabs.categories'
    | 'admin.menu.tabs.ingredients'
    | 'admin.menu.tabs.groups'
    | 'admin.menu.tabs.bulk'
    | 'admin.menu.tabs.images';
  end?: boolean;
}

const TABS: Tab[] = [
  { to: '/admin/menu', key: 'admin.menu.tabs.products', end: true },
  { to: '/admin/menu/categories', key: 'admin.menu.tabs.categories' },
  { to: '/admin/menu/ingredients', key: 'admin.menu.tabs.ingredients' },
  { to: '/admin/menu/groups', key: 'admin.menu.tabs.groups' },
  { to: '/admin/menu/bulk', key: 'admin.menu.tabs.bulk' },
  { to: '/admin/menu/images', key: 'admin.menu.tabs.images' },
];

/**
 * Menü bölümünün kabuğu. Sığ yapı (BUILD-PROMPT §10.4): admin menüsü → sekme → düzenleme paneli,
 * en fazla iki seviye. Sekmeler telefonda yatay kaydırılır, düzen kaymaz.
 */
export function MenuLayout() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <h1 className="text-2xl font-semibold">{t('admin.menu.title')}</h1>

      <nav aria-label={t('admin.menu.tabsLabel')} className="-mx-1 overflow-x-auto">
        <ul className="flex min-w-max gap-1 px-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  clsx(
                    'flex min-h-12 items-center rounded-control px-3 text-sm font-medium',
                    'transition-colors duration-150 ease-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                    isActive ? 'bg-lime/15 text-lime' : 'text-muted hover:bg-surface-2 hover:text-text',
                  )
                }
              >
                {t(tab.key)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet />
    </div>
  );
}

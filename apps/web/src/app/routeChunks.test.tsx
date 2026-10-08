import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../i18n';

// Parçaların içeriği burada önemli değil; sınanan şey "tembel yükleme + bekleme ekranı" kablolaması.
vi.mock('../features/admin/AdminApp', () => ({ default: () => <p>yönetim bölümü</p> }));
vi.mock('../features/waiter/WaiterApp', () => ({ default: () => <p>garson bölümü</p> }));
vi.mock('../features/kitchen/KitchenPage', () => ({ KitchenPage: () => <p>mutfak ekranı</p> }));
vi.mock('../features/publicMenu/PublicMenuPage', () => ({
  PublicMenuPage: () => <p>müşteri menüsü</p>,
}));

import { AdminRoute, KitchenRoute, PublicMenuRoute, WaiterRoute } from './routeChunks';

/**
 * R94 — her bölüm ayrı bir JS parçasıdır. Parça ağdan gelirken ekran BOŞ kalmamalı: ortak marka
 * yükleyicisi (`BrandLoader`) durur, parça gelince gerçek ekran onun yerini alır.
 */
describe('routeChunks', () => {
  const cases = [
    ['garson', WaiterRoute, 'garson bölümü'],
    ['mutfak', KitchenRoute, 'mutfak ekranı'],
    ['müşteri menüsü', PublicMenuRoute, 'müşteri menüsü'],
    ['yönetim', AdminRoute, 'yönetim bölümü'],
  ] as const;

  for (const [name, Route, text] of cases) {
    it(`${name} parçası gelene kadar marka yükleyicisi, sonra ekran çizilir`, async () => {
      render(<Route />);
      expect(screen.getByRole('status', { name: 'Yükleniyor' })).toBeInTheDocument();
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(screen.queryByRole('status', { name: 'Yükleniyor' })).not.toBeInTheDocument();
    });
  }
});

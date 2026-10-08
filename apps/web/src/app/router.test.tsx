import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Rota tablosu sınanıyor, ekranların kendisi değil: bölüm parçaları ve giriş ekranı sahte.
vi.mock('./routeChunks', () => ({
  WaiterRoute: () => null,
  KitchenRoute: () => null,
  PublicMenuRoute: () => null,
  AdminRoute: () => null,
}));
vi.mock('../features/auth/LoginPage', () => ({ LoginPage: () => null }));

import { router } from './router';
import { RoleGate } from './RoleGate';
import { AdminRoute, KitchenRoute, PublicMenuRoute, WaiterRoute } from './routeChunks';

const elementAt = (path: string): ReactElement<{ children?: ReactElement }> =>
  router.routes.find((r) => r.path === path)?.element as ReactElement<{
    children?: ReactElement;
  }>;

/**
 * R94 — bölümler ayrı parçalara taşındı. Bir ekranın yolu bu taşıma sırasında sessizce düşerse
 * kimse fark etmez: tablo burada tek tek doğrulanır.
 */
describe('router — rota tablosu', () => {
  it('her bölümün yolu yerinde', () => {
    expect(router.routes.map((r) => r.path)).toEqual([
      '/login',
      '/menu',
      '/waiter/*',
      '/kitchen',
      '/admin/*',
      '/',
      '*',
    ]);
  });

  it('bölüm yolları kendi parçasını çizer', () => {
    expect((elementAt('/menu').type as unknown) === PublicMenuRoute).toBe(true);
    for (const [path, Chunk] of [
      ['/waiter/*', WaiterRoute],
      ['/kitchen', KitchenRoute],
      ['/admin/*', AdminRoute],
    ] as const) {
      const child = elementAt(path).props.children as ReactElement;
      expect((child.type as unknown) === Chunk).toBe(true);
    }
  });

  it('yetki kapısı parçanın DIŞINDA: rolü uymayan cihaz parçayı indirmez', () => {
    for (const path of ['/waiter/*', '/kitchen', '/admin/*'])
      expect((elementAt(path).type as unknown) === RoleGate).toBe(true);
  });

  it('giriş ve müşteri menüsü kapısız kalır', () => {
    expect((elementAt('/login').type as unknown) === RoleGate).toBe(false);
    expect((elementAt('/menu').type as unknown) === RoleGate).toBe(false);
  });

  it('garson rotası `/waiter/*`: alt yollar bölümün kendi içinde çözülür', () => {
    // Eskiden `table/:tableId/order` üst düzeyde ayrı bir rotaydı; artık `WaiterApp` içinde.
    expect(router.routes.some((r) => r.path?.startsWith('/waiter/table'))).toBe(false);
  });
});

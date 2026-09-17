import { useQuery } from '@tanstack/react-query';
import { callRpc } from '../../../lib/rpc';
import type { PublicMenu } from '../types';

export const PUBLIC_MENU_KEY = ['public-menu'] as const;

/**
 * Girişsiz menü: tek `public_menu()` çağrısı (anon'a açık tek fonksiyon). 5 dk taze sayılır —
 * masadaki müşteri kategoriler arasında gezerken tekrar tekrar istek atılmaz; fiyat ve "tükendi"
 * değişikliği en geç bir sonraki açılışta görünür.
 */
export function usePublicMenu() {
  return useQuery({
    queryKey: PUBLIC_MENU_KEY,
    queryFn: () => callRpc<PublicMenu>('public_menu'),
    staleTime: 5 * 60_000,
    retry: 2,
  });
}

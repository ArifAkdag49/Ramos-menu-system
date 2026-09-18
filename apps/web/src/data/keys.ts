export const qk = {
  menu: ['menu'] as const,
  // Admin menü okumaları `menu` ön ekinin altındadır: Realtime `menu` olayı `qk.menu`'yu
  // geçersiz kıldığında yönetim listeleri de aynı anda tazelenir, ikinci bir abonelik gerekmez.
  adminCategories: ['menu', 'admin', 'categories'] as const,
  adminProducts: ['menu', 'admin', 'products'] as const,
  adminIngredients: ['menu', 'admin', 'ingredients'] as const,
  adminGroups: ['menu', 'admin', 'groups'] as const,
  tables: ['tables'] as const,
  // `tables` ön ekinin altında: Realtime `menu` olayı (`dining_tables` yazımı) ve `orders` olayı
  // (masa açıldı/kapandı) `qk.tables`'ı geçersiz kılınca yönetim listesi de tazelenir.
  adminTables: ['tables', 'admin'] as const,
  session: (tableId: string) => ['session', tableId] as const,
  sessionOrders: (sessionId: string) => ['orders', 'session', sessionId] as const,
  kitchen: ['orders', 'kitchen'] as const,
  // `orders` ön ekinin altında: Realtime `orders`/`print-jobs` olayları sipariş geçmişini ve açık
  // çekmeceyi de tazeler (fiş işi basıldı, kalem iptal edildi).
  adminOrders: (filter: object, limit: number) =>
    ['orders', 'admin', 'list', filter, limit] as const,
  adminOrder: (orderId: string) => ['orders', 'admin', 'detail', orderId] as const,
  ready: ['orders', 'ready'] as const,
  printer: ['printer-status'] as const,
  settings: ['settings'] as const,
  sdpPrinters: ['sdp-printers'] as const,
  stationDevices: ['station-devices'] as const,
  staff: ['staff'] as const,
  // `staff` ön ekinin altında: personel yazımı `qk.staff`'ı geçersiz kılınca ad haritası da tazelenir.
  adminStaff: ['staff', 'admin'] as const,
  bill: (sessionId: string) => ['bill', sessionId] as const,
  report: (from: string, to: string) => ['report', from, to] as const,
  audit: (limit: number) => ['audit', limit] as const,
  auditLog: (filter: object, limit: number) => ['audit', 'log', filter, limit] as const,
};

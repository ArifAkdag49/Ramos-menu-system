export const qk = {
  menu: ['menu'] as const,
  tables: ['tables'] as const,
  session: (tableId: string) => ['session', tableId] as const,
  sessionOrders: (sessionId: string) => ['orders', 'session', sessionId] as const,
  kitchen: ['orders', 'kitchen'] as const,
  ready: ['orders', 'ready'] as const,
  printer: ['printer-status'] as const,
  settings: ['settings'] as const,
  staff: ['staff'] as const,
  bill: (sessionId: string) => ['bill', sessionId] as const,
  report: (from: string, to: string) => ['report', from, to] as const,
  audit: (limit: number) => ['audit', limit] as const,
};

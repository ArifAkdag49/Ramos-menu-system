// Management API'nin geçici hataları (HTTP 5xx/429 ya da "Failed to perform authorization check") kısa üstel
// geri çekilmeyle en fazla 3 kez tekrar denenir. SQL hataları (4xx) asla tekrar denenmez: test hemen düşer.
const RETRY_DELAYS_MS = [500, 1000, 2000];
const isTransient = (status: number, body: string) =>
  status === 429 || status >= 500 || body.includes('Failed to perform authorization check');

export async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token) throw new Error('.env: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN eksik');
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const text = await res.text();
    if (res.ok) return (text ? JSON.parse(text) : []) as T[];
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined || !isTransient(res.status, text)) throw new Error(`SQL hatası (${res.status}): ${text}`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

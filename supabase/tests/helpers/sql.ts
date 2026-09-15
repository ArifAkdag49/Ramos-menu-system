export async function sql<T = Record<string, unknown>>(query: string): Promise<T[]> {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token) throw new Error('.env: SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN eksik');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SQL hatası (${res.status}): ${text}`);
  return (text ? JSON.parse(text) : []) as T[];
}

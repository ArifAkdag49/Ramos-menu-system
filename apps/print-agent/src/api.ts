import os from 'node:os';
import type { Database } from '@ramos/shared';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { AgentApi, AgentSettings, Heartbeat, Job, Logger } from './agent';
import type { AgentEnv } from './config';

// build.mjs bunu bundle sırasında JSON olarak gömer — ayrı bir dist dosyasına bağımlılık kalmaz.
import pkg from '../package.json' with { type: 'json' };
export const AGENT_VERSION: string = pkg.version;

const consoleLogger: Logger = {
  info: (m, d) => console.log(JSON.stringify({ level: 'info', msg: m, ...d })),
  warn: (m, d) => console.warn(JSON.stringify({ level: 'warn', msg: m, ...d })),
  error: (m, d) => console.error(JSON.stringify({ level: 'error', msg: m, ...d })),
};

type PrintJobRow = Database['public']['Tables']['print_jobs']['Row'];

function toJob(row: PrintJobRow): Job {
  return { id: row.id, type: row.type, payload: row.payload as unknown as Job['payload'], attempts: row.attempts };
}

/**
 * Yazıcı kullanıcısıyla giriş yapar, `print-jobs` ve `settings` private kanallarını dinler.
 * R55: `claim`/`complete` bu çalıştırmaya özgü bir kimlik kullanır (`${AGENT_ID}#${başlangıç}`),
 * `agent_heartbeat` ise sade `AGENT_ID` gönderir — takılmış eski bir süreçle yeniden başlayan
 * süreç böylece birbirinin işini kapatamaz (ownership guard'ı devre dışı bırakmazlar).
 */
export async function createSupabaseApi(env: AgentEnv, log: Logger = consoleLogger): Promise<AgentApi> {
  const sb: SupabaseClient<Database> = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: true },
  });

  const runAgentId = `${env.AGENT_ID}#${Date.now()}`;
  const channels: RealtimeChannel[] = [];

  const signIn = async (): Promise<void> => {
    const { error } = await sb.auth.signInWithPassword({ email: env.AGENT_EMAIL, password: env.AGENT_PASSWORD });
    if (error) throw new Error(`Ajan girişi başarısız: ${error.message}`);
    await sb.realtime.setAuth();
  };
  await signIn();

  // R52: `claim`/`complete`/`heartbeat` `401` (oturum düşmüş) dönerse bir kez yeniden giriş
  // yapılır, sonra tekrar denenir — sonsuz döngüye girmemesi için yalnızca bir kez.
  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ data: T | null; error: { message: string } | null }> {
    let res = await sb.rpc(fn as never, args as never);
    if (res.status === 401) {
      await signIn();
      res = await sb.rpc(fn as never, args as never);
    }
    return res as { data: T | null; error: { message: string } | null };
  }

  const api: AgentApi = {
    async claim(): Promise<Job | null> {
      const { data, error } = await rpc<PrintJobRow[]>('claim_print_job', { p_agent_id: runAgentId });
      if (error) throw new Error(`claim_print_job: ${error.message}`);
      const row = data?.[0];
      return row ? toJob(row) : null;
    },

    async complete(id: string, ok: boolean, error?: string): Promise<void> {
      const res = await rpc('complete_print_job', { p_job_id: id, p_ok: ok, p_error: error ?? null, p_agent_id: runAgentId });
      if (res.error) {
        // Başka bir ajan işi geri almışsa complete_print_job `job_not_printing` fırlatır —
        // bu baskı hatası değildir, yalnızca loglanır ve döngü devam eder (R52/R55).
        if (res.error.message === 'job_not_printing') {
          log.warn('job_not_printing — iş başka bir ajan tarafından geri alınmış', { job: id });
          return;
        }
        throw new Error(`complete_print_job: ${res.error.message}`);
      }
    },

    async heartbeat(h: Heartbeat): Promise<void> {
      const { error } = await rpc('agent_heartbeat', {
        p_agent_id: env.AGENT_ID,
        p_version: AGENT_VERSION,
        p_host: os.hostname(),
        p_reachable: h.reachable,
        p_state: h.state,
        p_error: h.error,
      });
      if (error) throw new Error(`agent_heartbeat: ${error.message}`);
    },

    async settings(): Promise<AgentSettings> {
      const { data, error } = await sb
        .from('settings')
        .select('printer_host, printer_port, printer_codepage, printer_codepage_number, printer_transliterate')
        .eq('id', 1)
        .single();
      if (error) throw new Error(`settings: ${error.message}`);
      return {
        host: data.printer_host,
        port: data.printer_port,
        codepage: data.printer_codepage,
        codepageNumber: data.printer_codepage_number,
        transliterate: data.printer_transliterate,
      };
    },

    onJobs(cb: () => void): void {
      channels.push(
        sb
          .channel('print-jobs', { config: { private: true } })
          .on('broadcast', { event: '*' }, () => cb())
          .subscribe(),
      );
    },

    onSettings(cb: (s: AgentSettings) => void): void {
      channels.push(
        sb
          .channel('settings', { config: { private: true } })
          .on('broadcast', { event: '*' }, () => {
            void api.settings().then(cb).catch((e: unknown) => log.warn('settings yenilenemedi', { e: String(e) }));
          })
          .subscribe(),
      );
    },

    async close(): Promise<void> {
      for (const ch of channels) await sb.removeChannel(ch);
      channels.length = 0;
      await sb.auth.signOut();
    },
  };

  return api;
}

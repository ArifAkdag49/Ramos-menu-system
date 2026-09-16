import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AgentEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  AGENT_EMAIL: string;
  AGENT_PASSWORD: string;
  AGENT_ID: string;
  LOG_DIR: string;
}

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'AGENT_EMAIL', 'AGENT_PASSWORD', 'AGENT_ID'] as const;

export class ConfigError extends Error {}

/** `.env` dosyasını `argv1`'in klasöründe, yoksa `cwd`'de arar (bulamazsa null). */
export function findEnvFile(argv1: string | undefined, cwd: string): string | null {
  const candidates: string[] = [];
  if (argv1) candidates.push(path.join(path.dirname(argv1), '.env'));
  candidates.push(path.join(cwd, '.env'));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** Bulunursa `.env` dosyasını `process.env`'e yükler (Node'un yerleşik `loadEnvFile`'ı ile). */
export function loadDotEnv(argv1: string | undefined = process.argv[1], cwd: string = process.cwd()): void {
  const file = findEnvFile(argv1, cwd);
  if (file) process.loadEnvFile(file);
}

/** Windows'ta `%LOCALAPPDATA%\RamosPrintAgent\logs`, diğer platformlarda `./logs`. */
export function defaultLogDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'RamosPrintAgent', 'logs');
  }
  return './logs';
}

/** `env`'i doğrular ve `AgentEnv`'e çevirir; zorunlu bir alan eksikse Türkçe mesajla `ConfigError` fırlatır. */
export function readConfig(env: NodeJS.ProcessEnv): AgentEnv {
  const missing = REQUIRED.filter((key) => !env[key] || env[key]!.trim() === '');
  if (missing.length > 0) {
    throw new ConfigError(
      `Eksik ortam değişkenleri: ${missing.join(', ')}. apps/print-agent/.env dosyasını kontrol edin.`,
    );
  }
  const logDir = env.LOG_DIR && env.LOG_DIR.trim() !== '' ? env.LOG_DIR : defaultLogDir();
  return {
    SUPABASE_URL: env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY!,
    AGENT_EMAIL: env.AGENT_EMAIL!,
    AGENT_PASSWORD: env.AGENT_PASSWORD!,
    AGENT_ID: env.AGENT_ID!,
    LOG_DIR: logDir,
  };
}

/** `.env`'i yükler ve doğrulanmış ayarları döner — CLI giriş noktası bunu çağırır. */
export function loadConfig(): AgentEnv {
  loadDotEnv();
  return readConfig(process.env);
}

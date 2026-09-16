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
  /**
   * Yazıcı kurulum sihirbazı (`Kurulum.cmd`): bu PC'nin ağında bulunan yazıcının adresi.
   * Doluysa sitedeki `settings.printer_host` yerine bu kullanılır — farklı ağlardaki
   * bilgisayarlar (ev / restoran) kendi yazıcılarını kullanabilsin diye. Boşsa site ayarı geçerli.
   */
  PRINTER_HOST?: string;
  /** `PRINTER_HOST` ile birlikte isteğe bağlı port (boşsa site ayarı). */
  PRINTER_PORT?: number;
  /**
   * Sade harf modu (kurulum sihirbazı, test fişinde harfler bozuk çıkınca): fişteki ASCII dışı
   * her harf düz karşılığına çevrilir (ä→ae, ß→ss, ş→s …), yazıcının karakter tablosundan
   * bağımsız okunur fiş. Yoksa kapalı.
   */
  PRINTER_ASCII?: boolean;
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
  const printerHost = env.PRINTER_HOST?.trim() ?? '';
  if (printerHost !== '' && !/^[A-Za-z0-9.-]{1,253}$/.test(printerHost)) {
    throw new ConfigError(`PRINTER_HOST geçersiz: "${printerHost}". Örnek: PRINTER_HOST=192.168.1.250`);
  }
  const printerPortRaw = env.PRINTER_PORT?.trim() ?? '';
  const printerPort = printerPortRaw === '' ? undefined : Number(printerPortRaw);
  if (printerPort !== undefined && !(Number.isInteger(printerPort) && printerPort >= 1 && printerPort <= 65535)) {
    throw new ConfigError(`PRINTER_PORT geçersiz: "${printerPortRaw}". 1–65535 arası bir sayı olmalı (yazıcı için genelde 9100).`);
  }
  const asciiRaw = env.PRINTER_ASCII?.trim().toLowerCase() ?? '';
  let printerAscii: boolean | undefined;
  if (['1', 'true', 'ja', 'evet'].includes(asciiRaw)) printerAscii = true;
  else if (['0', 'false', 'nein', 'hayir', 'hayır'].includes(asciiRaw)) printerAscii = false;
  else if (asciiRaw !== '') {
    throw new ConfigError(`PRINTER_ASCII geçersiz: "${env.PRINTER_ASCII}". 1 (sade harf) ya da 0 olmalı.`);
  }
  return {
    SUPABASE_URL: env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY!,
    AGENT_EMAIL: env.AGENT_EMAIL!,
    AGENT_PASSWORD: env.AGENT_PASSWORD!,
    AGENT_ID: env.AGENT_ID!,
    LOG_DIR: logDir,
    ...(printerHost !== '' ? { PRINTER_HOST: printerHost } : {}),
    ...(printerPort !== undefined ? { PRINTER_PORT: printerPort } : {}),
    ...(printerAscii !== undefined ? { PRINTER_ASCII: printerAscii } : {}),
  };
}

/** `.env`'i yükler ve doğrulanmış ayarları döner — CLI giriş noktası bunu çağırır. */
export function loadConfig(): AgentEnv {
  loadDotEnv();
  return readConfig(process.env);
}

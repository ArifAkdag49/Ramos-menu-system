import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isSupportedCodepage, knownCodepagePairs } from './escpos';

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
  /** `PRINTER_HOST` ile birlikte isteğe bağlı port (boşsa site ayarı). 9143 = Epson şifreli (TLS) baskı, 443/80 = Epson ePOS-Print. */
  PRINTER_PORT?: number;
  /**
   * Bu PC'nin yazıcısına özel karakter tablosu (kurulum sihirbazı Epson bulunca `windows1254` yazar).
   * `PRINTER_CODEPAGE_NUMBER` ile BİRLİKTE verilmelidir; doluysa sitedeki `printer_codepage` /
   * `printer_codepage_number` yerine kullanılır. Çift, escpos.ts'teki bilinen tabloda olmalıdır.
   */
  PRINTER_CODEPAGE?: string;
  /** `ESC t` numarası (Epson WPC1254 = 48, Xprinter CP857 = 61). */
  PRINTER_CODEPAGE_NUMBER?: number;
  /**
   * Sade harf modu (kurulum sihirbazı, test fişinde harfler bozuk çıkınca): fişteki ASCII dışı
   * her harf düz karşılığına çevrilir (ä→ae, ß→ss, ş→s …), yazıcının karakter tablosundan
   * bağımsız okunur fiş. Yoksa kapalı.
   */
  PRINTER_ASCII?: boolean;
  /**
   * Yazıcının donanım (MAC) adresi, `aa:bb:cc:dd:ee:ff`. Ajan yazıcıya ilk ulaştığında kendisi
   * öğrenip yazar; yazıcının IP adresi değişirse (DHCP) ağda aynı cihazı bununla tanır.
   */
  PRINTER_MAC?: string;
  /**
   * USB ile bu bilgisayara bağlı yazıcının Windows'taki adı (Yazıcılar listesindeki ad). Doluysa
   * fişler ağ yerine bu yazıcı kuyruğuna RAW olarak gönderilir; PRINTER_HOST kullanılmaz.
   */
  PRINTER_USB?: string;
  /** USB yardımcısının (ramos-usb.exe) tam yolu; boşsa ajan dosyasının yanındaki ramos-usb.exe. */
  PRINTER_USB_EXE?: string;
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
    throw new ConfigError(`PRINTER_PORT geçersiz: "${printerPortRaw}". 1–65535 arası bir sayı olmalı (yazıcı için genelde 9100; Epson şifreli baskı 9143; Epson ePOS-Print 443).`);
  }
  const codepage = env.PRINTER_CODEPAGE?.trim() ?? '';
  const codepageNumberRaw = env.PRINTER_CODEPAGE_NUMBER?.trim() ?? '';
  if ((codepage === '') !== (codepageNumberRaw === '')) {
    throw new ConfigError(
      'PRINTER_CODEPAGE ve PRINTER_CODEPAGE_NUMBER birlikte verilmeli (ör. Epson: PRINTER_CODEPAGE=windows1254, PRINTER_CODEPAGE_NUMBER=48).',
    );
  }
  const codepageNumber = codepageNumberRaw === '' ? undefined : Number(codepageNumberRaw);
  if (codepage !== '' && !(/^\d{1,3}$/.test(codepageNumberRaw) && isSupportedCodepage(codepage, codepageNumber!))) {
    throw new ConfigError(
      `PRINTER_CODEPAGE/PRINTER_CODEPAGE_NUMBER geçersiz: "${codepage}" = "${codepageNumberRaw}". Bilinen eşleşmeler: ${knownCodepagePairs()}`,
    );
  }
  const asciiRaw = env.PRINTER_ASCII?.trim().toLowerCase() ?? '';
  let printerAscii: boolean | undefined;
  if (['1', 'true', 'ja', 'evet'].includes(asciiRaw)) printerAscii = true;
  else if (['0', 'false', 'nein', 'hayir', 'hayır'].includes(asciiRaw)) printerAscii = false;
  else if (asciiRaw !== '') {
    throw new ConfigError(`PRINTER_ASCII geçersiz: "${env.PRINTER_ASCII}". 1 (sade harf) ya da 0 olmalı.`);
  }
  const macRaw = env.PRINTER_MAC?.trim() ?? '';
  const printerMac = macRaw === '' ? null : normalizeMac(macRaw);
  if (macRaw !== '' && !printerMac) {
    throw new ConfigError(`PRINTER_MAC geçersiz: "${macRaw}". Örnek: PRINTER_MAC=02:b0:3e:f5:25:de`);
  }
  const printerUsb = env.PRINTER_USB?.trim() ?? '';
  if (printerUsb.length > 200) throw new ConfigError('PRINTER_USB çok uzun (en fazla 200 karakter).');
  const printerUsbExe = env.PRINTER_USB_EXE?.trim() ?? '';
  return {
    SUPABASE_URL: env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY!,
    AGENT_EMAIL: env.AGENT_EMAIL!,
    AGENT_PASSWORD: env.AGENT_PASSWORD!,
    AGENT_ID: env.AGENT_ID!,
    LOG_DIR: logDir,
    ...(printerHost !== '' ? { PRINTER_HOST: printerHost } : {}),
    ...(printerPort !== undefined ? { PRINTER_PORT: printerPort } : {}),
    ...(codepage !== '' && codepageNumber !== undefined
      ? { PRINTER_CODEPAGE: codepage, PRINTER_CODEPAGE_NUMBER: codepageNumber }
      : {}),
    ...(printerAscii !== undefined ? { PRINTER_ASCII: printerAscii } : {}),
    ...(printerMac ? { PRINTER_MAC: printerMac } : {}),
    ...(printerUsb !== '' ? { PRINTER_USB: printerUsb } : {}),
    ...(printerUsbExe !== '' ? { PRINTER_USB_EXE: printerUsbExe } : {}),
  };
}

/** MAC adresini `aa:bb:cc:dd:ee:ff` biçimine getirir (`-` ya da `:` ayraçlı); geçersiz, boş (00…) ya da yayın (ff…) ise null. */
export function normalizeMac(raw: string): string | null {
  const m = raw.trim().toLowerCase().match(/^([0-9a-f]{2})[-:]([0-9a-f]{2})[-:]([0-9a-f]{2})[-:]([0-9a-f]{2})[-:]([0-9a-f]{2})[-:]([0-9a-f]{2})$/);
  if (!m) return null;
  const mac = m.slice(1).join(':');
  if (mac === '00:00:00:00:00:00' || mac === 'ff:ff:ff:ff:ff:ff') return null;
  return mac;
}

/**
 * `.env` dosyasında verilen anahtarları günceller (yoksa sona ekler); diğer satırlara dokunmaz.
 * Ajan çalışırken yazıcının yeni adresini / MAC'ini kalıcı kılmak için kullanılır. Önce geçici
 * dosyaya yazılıp yerine taşınır: yazma yarıda kesilirse (elektrik) eski dosya bozulmaz.
 */
export function updateEnvFile(file: string, updates: Record<string, string>): void {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  for (const [key, value] of Object.entries(updates)) {
    const i = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
    if (i >= 0) lines[i] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${lines.join('\n')}\n`, 'utf8');
  fs.renameSync(tmp, file);
}

/** `.env`'i yükler ve doğrulanmış ayarları döner — CLI giriş noktası bunu çağırır. */
export function loadConfig(): AgentEnv {
  loadDotEnv();
  return readConfig(process.env);
}

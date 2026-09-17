import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigError, defaultLogDir, findEnvFile, normalizeMac, readConfig, updateEnvFile } from './config';

describe('readConfig', () => {
  const full = {
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    AGENT_EMAIL: 'drucker@staff.example.com',
    AGENT_PASSWORD: 'secret1234',
    AGENT_ID: 'ramos-pc-1',
  };

  it('tüm alanlar doluysa AgentEnv döner, LOG_DIR boşsa varsayılan kullanılır', () => {
    const cfg = readConfig({ ...full, LOG_DIR: '' });
    expect(cfg.SUPABASE_URL).toBe(full.SUPABASE_URL);
    expect(cfg.AGENT_ID).toBe('ramos-pc-1');
    expect(cfg.LOG_DIR).toBe(defaultLogDir());
  });

  it('LOG_DIR doluysa aynen kullanılır', () => {
    const cfg = readConfig({ ...full, LOG_DIR: 'C:\\logs\\ramos' });
    expect(cfg.LOG_DIR).toBe('C:\\logs\\ramos');
  });

  it('zorunlu bir alan eksikse Türkçe hata mesajıyla ConfigError fırlatır', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { AGENT_ID, ...rest } = full;
    expect(() => readConfig({ ...rest })).toThrow(ConfigError);
    try {
      readConfig({ ...rest });
      expect.fail('hata bekleniyordu');
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as Error).message).toContain('AGENT_ID');
      expect((e as Error).message).toMatch(/Eksik/);
    }
  });

  it('birden çok alan eksikse hepsini listeler', () => {
    expect(() => readConfig({})).toThrowError(/SUPABASE_URL.*SUPABASE_ANON_KEY.*AGENT_EMAIL.*AGENT_PASSWORD.*AGENT_ID/s);
  });

  it('PRINTER_HOST/PRINTER_PORT boş ya da yoksa alanlar hiç eklenmez (site ayarı geçerli)', () => {
    expect(readConfig(full)).not.toHaveProperty('PRINTER_HOST');
    const cfg = readConfig({ ...full, PRINTER_HOST: '  ', PRINTER_PORT: '' });
    expect(cfg).not.toHaveProperty('PRINTER_HOST');
    expect(cfg).not.toHaveProperty('PRINTER_PORT');
  });

  it('PRINTER_HOST ve PRINTER_PORT doluysa kırpılıp okunur', () => {
    const cfg = readConfig({ ...full, PRINTER_HOST: ' 192.168.178.250 ', PRINTER_PORT: '9100' });
    expect(cfg.PRINTER_HOST).toBe('192.168.178.250');
    expect(cfg.PRINTER_PORT).toBe(9100);
  });

  it('PRINTER_ASCII: 1/true açık, 0/false kapalı, boşsa alan yok, başka değer ConfigError', () => {
    expect(readConfig({ ...full, PRINTER_ASCII: '1' }).PRINTER_ASCII).toBe(true);
    expect(readConfig({ ...full, PRINTER_ASCII: 'true' }).PRINTER_ASCII).toBe(true);
    expect(readConfig({ ...full, PRINTER_ASCII: '0' }).PRINTER_ASCII).toBe(false);
    expect(readConfig({ ...full, PRINTER_ASCII: '' })).not.toHaveProperty('PRINTER_ASCII');
    expect(() => readConfig({ ...full, PRINTER_ASCII: 'belki' })).toThrowError(/PRINTER_ASCII geçersiz/);
  });

  it('PRINTER_CODEPAGE + PRINTER_CODEPAGE_NUMBER (Epson windows1254/48) birlikte okunur; boşsa alanlar eklenmez', () => {
    const cfg = readConfig({ ...full, PRINTER_PORT: '9143', PRINTER_CODEPAGE: ' windows1254 ', PRINTER_CODEPAGE_NUMBER: '48' });
    expect(cfg.PRINTER_PORT).toBe(9143);
    expect(cfg.PRINTER_CODEPAGE).toBe('windows1254');
    expect(cfg.PRINTER_CODEPAGE_NUMBER).toBe(48);
    expect(readConfig({ ...full, PRINTER_CODEPAGE: '', PRINTER_CODEPAGE_NUMBER: ' ' })).not.toHaveProperty('PRINTER_CODEPAGE');
    expect(readConfig(full)).not.toHaveProperty('PRINTER_CODEPAGE_NUMBER');
    expect(readConfig({ ...full, PRINTER_CODEPAGE: 'cp857', PRINTER_CODEPAGE_NUMBER: '61' }).PRINTER_CODEPAGE_NUMBER).toBe(61);
  });

  it('kod sayfası çiftinin yalnız biri verilirse ConfigError', () => {
    expect(() => readConfig({ ...full, PRINTER_CODEPAGE: 'windows1254' })).toThrowError(/birlikte verilmeli/);
    expect(() => readConfig({ ...full, PRINTER_CODEPAGE_NUMBER: '48' })).toThrow(ConfigError);
  });

  it('bilinen tabloda olmayan ya da uyuşmayan çift ConfigError (cp857/48, utf8/0, windows1254/4x)', () => {
    expect(() => readConfig({ ...full, PRINTER_CODEPAGE: 'cp857', PRINTER_CODEPAGE_NUMBER: '48' })).toThrowError(/PRINTER_CODEPAGE\/PRINTER_CODEPAGE_NUMBER geçersiz/);
    expect(() => readConfig({ ...full, PRINTER_CODEPAGE: 'utf8', PRINTER_CODEPAGE_NUMBER: '0' })).toThrow(ConfigError);
    expect(() => readConfig({ ...full, PRINTER_CODEPAGE: 'windows1254', PRINTER_CODEPAGE_NUMBER: '4x' })).toThrow(ConfigError);
  });

  it('geçersiz PRINTER_HOST ya da PRINTER_PORT Türkçe mesajla ConfigError fırlatır', () => {
    expect(() => readConfig({ ...full, PRINTER_HOST: '192.168.1.250:9100' })).toThrowError(/PRINTER_HOST geçersiz/);
    expect(() => readConfig({ ...full, PRINTER_HOST: 'yazıcı adı' })).toThrow(ConfigError);
    expect(() => readConfig({ ...full, PRINTER_PORT: '70000' })).toThrowError(/PRINTER_PORT geçersiz/);
    expect(() => readConfig({ ...full, PRINTER_PORT: '91a' })).toThrow(ConfigError);
  });
});

describe('defaultLogDir', () => {
  it('Windows\'ta %LOCALAPPDATA%\\RamosPrintAgent\\logs döner', () => {
    const dir = defaultLogDir('win32', { LOCALAPPDATA: 'C:\\Users\\PC\\AppData\\Local' });
    expect(dir).toBe('C:\\Users\\PC\\AppData\\Local\\RamosPrintAgent\\logs');
  });

  it('Windows dışında ./logs döner', () => {
    expect(defaultLogDir('linux', {})).toBe('./logs');
  });
});

describe('findEnvFile', () => {
  it('argv[1] klasöründe .env varsa onu bulur (yoksa null döner)', () => {
    // Ne argv1 klasöründe ne de cwd'de gerçek bir .env dosyası olmayan bir yol veriyoruz.
    expect(findEnvFile('/nonexistent/dir/cli.js', '/also/nonexistent')).toBeNull();
  });
});

describe('PRINTER_MAC', () => {
  const full = {
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    AGENT_EMAIL: 'drucker@staff.example.com',
    AGENT_PASSWORD: 'secret1234',
    AGENT_ID: 'ramos-pc-1',
  };

  it('Windows (-) ve Linux (:) biçimini aa:bb:cc:dd:ee:ff olarak okur; boşsa alan eklenmez', () => {
    expect(readConfig({ ...full, PRINTER_MAC: '02-B0-3E-F5-25-DE' }).PRINTER_MAC).toBe('02:b0:3e:f5:25:de');
    expect(readConfig({ ...full, PRINTER_MAC: ' 02:b0:3e:f5:25:de ' }).PRINTER_MAC).toBe('02:b0:3e:f5:25:de');
    expect(readConfig({ ...full, PRINTER_MAC: '' })).not.toHaveProperty('PRINTER_MAC');
  });

  it('geçersiz, boş (00…) ya da yayın (ff…) adresi reddeder', () => {
    expect(() => readConfig({ ...full, PRINTER_MAC: '02:b0:3e' })).toThrowError(/PRINTER_MAC geçersiz/);
    expect(normalizeMac('00-00-00-00-00-00')).toBeNull();
    expect(normalizeMac('ff:ff:ff:ff:ff:ff')).toBeNull();
  });
});

describe('updateEnvFile', () => {
  it('var olan anahtarı değiştirir, olmayanı sona ekler, diğer satırlara ve yorumlara dokunmaz', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramos-env-'));
    const file = path.join(dir, '.env');
    fs.writeFileSync(file, '\uFEFF# not\r\nAGENT_ID=ramos-pc\r\nPRINTER_HOST=192.168.178.20\r\n', 'utf8');
    updateEnvFile(file, { PRINTER_HOST: '192.168.178.31', PRINTER_MAC: '02:b0:3e:f5:25:de' });
    expect(fs.readFileSync(file, 'utf8')).toBe('# not\nAGENT_ID=ramos-pc\nPRINTER_HOST=192.168.178.31\nPRINTER_MAC=02:b0:3e:f5:25:de\n');
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('PRINTER_USB', () => {
  const full = {
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    AGENT_EMAIL: 'drucker@staff.example.com',
    AGENT_PASSWORD: 'secret1234',
    AGENT_ID: 'ramos-pc-1',
  };

  it('Windows yazıcı adını ve yardımcı yolunu kırpıp okur; boşsa alanlar eklenmez', () => {
    const cfg = readConfig({ ...full, PRINTER_USB: ' POS-80 Küche ', PRINTER_USB_EXE: ' C:\\Ramos\\ramos-usb.exe ' });
    expect(cfg.PRINTER_USB).toBe('POS-80 Küche');
    expect(cfg.PRINTER_USB_EXE).toBe('C:\\Ramos\\ramos-usb.exe');
    expect(readConfig({ ...full, PRINTER_USB: '' })).not.toHaveProperty('PRINTER_USB');
  });

  it('aşırı uzun adı reddeder', () => {
    expect(() => readConfig({ ...full, PRINTER_USB: 'x'.repeat(201) })).toThrowError(/PRINTER_USB çok uzun/);
  });
});

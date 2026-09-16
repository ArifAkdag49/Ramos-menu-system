import { describe, expect, it } from 'vitest';
import { ConfigError, defaultLogDir, findEnvFile, readConfig } from './config';

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

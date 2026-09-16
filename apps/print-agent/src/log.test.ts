import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './log';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramos-agent-log-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('createLogger', () => {
  it('info() JSON satırını agent-YYYY-MM-DD.log dosyasına yazar', () => {
    const now = () => new Date('2026-09-15T12:34:56Z');
    const logger = createLogger(dir, now);
    logger.info('printed', { job: 'a' });

    const file = path.join(dir, 'agent-2026-09-15.log');
    expect(fs.existsSync(file)).toBe(true);
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed).toMatchObject({ level: 'info', msg: 'printed', job: 'a' });
  });

  it('warn() ve error() de aynı günün dosyasına JSON satırı ekler', () => {
    const now = () => new Date('2026-09-15T12:34:56Z');
    const logger = createLogger(dir, now);
    logger.warn('dikkat');
    logger.error('patladı', { code: 'io' });

    const file = path.join(dir, 'agent-2026-09-15.log');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 'warn', msg: 'dikkat' });
    expect(JSON.parse(lines[1]!)).toMatchObject({ level: 'error', msg: 'patladı', code: 'io' });
  });

  it('8 gün önce tarihli bir dosya, logger yeniden başlatılınca silinir', () => {
    const oldFile = path.join(dir, 'agent-2026-09-07.log');
    fs.writeFileSync(oldFile, '{}\n');
    const eightDaysAgo = new Date('2026-09-15T00:00:00Z').getTime() - 8 * 24 * 60 * 60 * 1000;
    fs.utimesSync(oldFile, eightDaysAgo / 1000, eightDaysAgo / 1000);

    createLogger(dir, () => new Date('2026-09-15T00:00:00Z'));

    expect(fs.existsSync(oldFile)).toBe(false);
  });

  it('7 günden yeni bir dosyayı silmez', () => {
    const recentFile = path.join(dir, 'agent-2026-09-10.log');
    fs.writeFileSync(recentFile, '{}\n');
    const fiveDaysAgo = new Date('2026-09-15T00:00:00Z').getTime() - 5 * 24 * 60 * 60 * 1000;
    fs.utimesSync(recentFile, fiveDaysAgo / 1000, fiveDaysAgo / 1000);

    createLogger(dir, () => new Date('2026-09-15T00:00:00Z'));

    expect(fs.existsSync(recentFile)).toBe(true);
  });

  it('5 MB\'ı aşan günlük dosyası döndürülür (rotate)', () => {
    const now = () => new Date('2026-09-15T12:00:00Z');
    const file = path.join(dir, 'agent-2026-09-15.log');
    fs.writeFileSync(file, 'x'.repeat(5 * 1024 * 1024 + 10));

    const logger = createLogger(dir, now);
    logger.info('yeni satır');

    expect(fs.existsSync(`${file}.1`)).toBe(true);
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ msg: 'yeni satır' });
  });

  it('dir = null ise yalnızca konsola yazılır ve hata vermez', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger(null);
    expect(() => logger.info('merhaba')).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

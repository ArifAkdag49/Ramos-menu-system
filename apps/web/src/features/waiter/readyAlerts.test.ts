import { describe, expect, it } from 'vitest';
import { newlyReady, reduceReadyAlerts, type ReadyAlertState } from './readyAlerts';

const o = (id: string) => ({ id });

describe('newlyReady', () => {
  it('yalnız daha önce görülmemiş hazır siparişleri döner', () => {
    expect(newlyReady(new Set(['a']), [o('a'), o('b')])).toEqual([o('b')]);
  });

  it('hiçbiri yeni değilse boş', () => {
    expect(newlyReady(new Set(['a', 'b']), [o('b')])).toEqual([]);
  });
});

describe('reduceReadyAlerts', () => {
  const start: ReadyAlertState = { seen: null, alerted: [] };

  it('ilk yüklemede uyarı yok — mevcut hazırlar yalnız "görüldü" sayılır', () => {
    const r = reduceReadyAlerts(start, [o('a'), o('b')]);
    expect(r.fresh).toEqual([]);
    expect(r.state.alerted).toEqual([]);
    expect([...r.state.seen!]).toEqual(['a', 'b']);
  });

  it('sonradan hazır olan sipariş uyarı listesine en sona eklenir', () => {
    const first = reduceReadyAlerts(start, [o('a')]).state;
    const r = reduceReadyAlerts(first, [o('a'), o('b')]);
    expect(r.fresh).toEqual(['b']);
    expect(r.state.alerted).toEqual(['b']);
  });

  it('teslim edilen (listeden düşen) sipariş uyarıdan da düşer', () => {
    let s = reduceReadyAlerts(start, []).state;
    s = reduceReadyAlerts(s, [o('a')]).state;
    s = reduceReadyAlerts(s, [o('a'), o('b')]).state;
    expect(s.alerted).toEqual(['a', 'b']);
    const r = reduceReadyAlerts(s, [o('b')]);
    expect(r.fresh).toEqual([]);
    expect(r.state.alerted).toEqual(['b']);
  });

  it('geri alınıp (mutfak "Geri al") yeniden hazır olan sipariş tekrar uyarır', () => {
    let s = reduceReadyAlerts(start, []).state;
    s = reduceReadyAlerts(s, [o('a')]).state;
    s = reduceReadyAlerts(s, []).state;
    const r = reduceReadyAlerts(s, [o('a')]);
    expect(r.fresh).toEqual(['a']);
  });
});

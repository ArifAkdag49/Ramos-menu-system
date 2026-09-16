import { describe, expect, it } from 'vitest';
import { toastMotion } from './toastMotion';

/**
 * R77: spec §8.2 gönderimden sonra kısa bir başarı geri bildirimi ister. Tek mikro-animasyon
 * toast kartının girişidir; `prefers-reduced-motion` altında tamamen kapanır (BUILD-PROMPT §10).
 */
describe('toastMotion', () => {
  it('normalde yukarı doğru kısa bir giriş yapar', () => {
    const m = toastMotion(false);
    expect(m.initial).toMatchObject({ opacity: 0 });
    expect(m.transition.duration).toBeGreaterThan(0);
    expect(m.transition.duration).toBeLessThanOrEqual(0.25);
  });

  it('hareket azaltma açıkken hiç hareket yok — yalnız anında görünür', () => {
    const m = toastMotion(true);
    expect(m.initial).toBe(false);
    expect(m.transition.duration).toBe(0);
  });

  it('her iki durumda da bitiş durumu aynıdır (kart yerinde ve tam görünür)', () => {
    expect(toastMotion(true).animate).toEqual(toastMotion(false).animate);
  });
});

import { useCallback, useRef } from 'react';

const BEEP_HZ = 880;
const BEEP_MS = 180;
const BEEP_GAP_MS = 80;

type AnyAudioContext = AudioContext;

/**
 * Yeni sipariş sesi. Tarayıcı otomatik oynatmayı kullanıcı dokunuşuna kadar engeller —
 * `unlock()` ilk dokunuşta çağrılır ve `AudioContext`'i (varsa askıdaysa) uyandırır. Kilit
 * durumu `localStorage`'da tutulmaz: her açılışta yeniden dokunmak gerekir (brief). API
 * desteklenmiyorsa ya da izin yoksa her iki fonksiyon da sessizce hiçbir şey yapmaz —
 * mutfak tableti bu yüzden asla beyaz ekran vermez.
 */
export function useSoundAlert() {
  const ctxRef = useRef<AnyAudioContext | null>(null);

  const getContext = (): AnyAudioContext | null => {
    if (ctxRef.current) return ctxRef.current;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
      return ctxRef.current;
    } catch {
      return null;
    }
  };

  const playTone = (ctx: AnyAudioContext, freq: number, startAt: number) => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + BEEP_MS / 1000);
    } catch {
      /* çalma başarısız — sessizce vazgeç */
    }
  };

  /** İlk kullanıcı dokunuşunda çağrılır: sesi kilitlenmemiş duruma getirir. */
  const unlock = useCallback(() => {
    try {
      const ctx = getContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      // Sessiz bir kısa ses: iOS/Chrome'un "kullanıcı etkileşimi" şartını karşılar.
      try {
        const buffer = ctx.createBuffer(1, 1, 22_050);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      } catch {
        /* tarayıcı desteklemiyor — beep() yine de denenecek */
      }
    } catch {
      /* izin engeli — sessizce vazgeç */
    }
  }, []);

  /** Yeni sipariş uyarısı: 880 Hz, 180 ms, iki kez. */
  const beep = useCallback(() => {
    try {
      const ctx = getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      playTone(ctx, BEEP_HZ, now);
      playTone(ctx, BEEP_HZ, now + (BEEP_MS + BEEP_GAP_MS) / 1000);
    } catch {
      /* sessizce vazgeç */
    }
  }, []);

  return { unlock, beep };
}

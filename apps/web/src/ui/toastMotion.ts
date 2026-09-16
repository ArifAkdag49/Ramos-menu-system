type Target = { opacity: number; y: number; scale: number };

/**
 * Toast kartının giriş animasyonu — spec §8.2'nin "gönderim sonrası başarı animasyonu" isteğinin
 * karşılığı (R77). Tek bir mikro-animasyon: kart aşağıdan kısa bir yay ile belirir. Gönderim
 * garsonu masa detayına atıyor, bu yüzden ayrı bir başarı ekranı yok; geri bildirim toast'ta.
 *
 * `prefers-reduced-motion` açıkken hareket **tamamen** kapanır: `initial: false` ile kart ilk
 * kareden itibaren son hâlindedir, süre sıfırdır. Bitiş durumu iki yolda da aynı olmalıdır ki
 * hareketsiz kullanıcı eksik bir şey görmesin.
 */
export const toastMotion = (
  reduced: boolean,
): {
  initial: Target | false;
  animate: Target;
  transition: { duration: number; ease: [number, number, number, number] };
} => ({
  initial: reduced ? false : { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: reduced ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] },
});

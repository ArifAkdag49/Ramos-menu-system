/**
 * "Şu an bölünmemesi gereken iş var" sayacı. Yeni sürüm hazır olduğunda sayfa kendiliğinden
 * yenilenir (`pwa/updateScheduler`); yarıda kalması zararlı olan işler (tablet yazıcı istasyonunun
 * baskı döngüsü gibi) süresince bu sayaç sıfırdan büyük tutulur ve yenileme ertelenir.
 */
let count = 0;

/** İşi başlat; dönen işlevi `finally` içinde çağır. İki kez çağrılsa da sayaç bozulmaz. */
export function markCriticalWork(): () => void {
  count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count -= 1;
  };
}

export function hasCriticalWork(): boolean {
  return count > 0;
}

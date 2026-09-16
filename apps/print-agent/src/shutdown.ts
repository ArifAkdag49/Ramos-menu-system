import type { Agent, Logger } from './agent';

// M4 (review fix round 4, I-1'in devamı): `agent.stop()` artık süre sınırı olmadan (basılmış-ama-
// onaylanmamış bir iş için) bekleyebiliyor — bu bekleme sürerken bir OPERATÖR ikinci bir Ctrl+C
// basarsa eski kod bunu SESSİZCE yutuyordu (`if (stopping) return;`), kapanış tamamen ölü/yanıtsız
// görünüyordu. İkinci (ve sonraki) sinyaller artık `log.warn` ile görünür olur — ama kapanış İPTAL
// EDİLMEZ (R68 korunur: basılmış-ama-doğrulanmamış iş asla terk edilmez) ve `agent.stop()` TEKRAR
// ÇAĞRILMAZ (zaten `Agent.stop()` M3 ile idempotent, ama burada da ikinci bir çağrıyı önlemek daha
// net). `cli.ts`'in kendisi `main()`'i modül yüklenirken çalıştırdığından (CLI giriş noktası),
// bu fabrika fonksiyonu test edilebilir olsun diye AYRI bir modülde tutulur — `cli.ts`'i doğrudan
// import etmek gerçek `main()`'i tetikler.
export function createShutdownHandler(agent: Pick<Agent, 'stop'>, log: Logger, onDone: () => void): (signal: string) => void {
  let stopping = false;
  return (signal: string): void => {
    if (stopping) {
      log.warn('kapanış zaten sürüyor — basılmış iş doğrulanıyor, bekleniyor (iptal edilmiyor)', { signal });
      return;
    }
    stopping = true;
    log.info('kapatılıyor', { signal });
    void agent
      .stop()
      .catch((e: unknown) => log.error('kapatma sırasında hata', { e: String(e) }))
      .finally(onDone);
  };
}

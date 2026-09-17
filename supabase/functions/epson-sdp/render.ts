// epson-sdp — fiş baytları: yazdırma ajanıyla BİREBİR aynı kod (renderTicket + encodeLines).
//
// Bu dosya Deno'ya doğrudan yüklenmez: depo modüllerini (packages/shared, apps/print-agent) ve npm
// bağımlılıklarını (@point-of-sale/*) içe aktarır. Yayından önce scripts/build-epson-sdp.mjs onu
// esbuild ile tek dosyaya (render.bundle.js, git'e girmez) paketler; index.ts paketi kullanır.
// Testler (Node/Vitest) bu kaynağı doğrudan içe aktarır.
import { renderTicket, type TicketPayload } from '../../../packages/shared/src/ticket.ts';
import { encodeLines } from '../../../apps/print-agent/src/escpos.ts';

export function renderEscpos(
  payload: Record<string, unknown>,
  settings: { codepage: string; codepageNumber: number; transliterate: boolean },
): Uint8Array {
  const lines = renderTicket(payload as unknown as TicketPayload, { transliterate: settings.transliterate });
  return encodeLines(lines, { codepage: settings.codepage, codepageNumber: settings.codepageNumber });
}

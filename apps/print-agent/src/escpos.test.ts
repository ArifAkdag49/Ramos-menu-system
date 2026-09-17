import type { Line } from '@ramos/shared';
import { describe, expect, it } from 'vitest';
import { encodeLines } from './escpos';
import { sendBytes } from './transport';
import { startFakePrinter } from './fake-printer';

// Kodlayıcının saf testleri packages/shared/src/escpos.test.ts'e taşındı; burada yalnız ajana özgü
// tümleştirme kalır (encodeLines çıktısı gerçek soket üzerinden sahte yazıcıya baytı baytına ulaşır).
describe('encodeLines -> transport tümleştirmesi (Minor 9): encoder çıktısı sahte yazıcıya baytı baytına ulaşır', () => {
  it('sendBytes ile gönderilen encodeLines çıktısı fake printer jobs\'ta değişmeden görünür', async () => {
    const lines: Line[] = [{ kind: 'text', text: 'X' }, { kind: 'feed', lines: 1 }];
    const encoded = encodeLines(lines, { codepage: 'cp857', codepageNumber: 61 });
    const fp = await startFakePrinter({});
    try {
      await sendBytes('127.0.0.1', fp.port, encoded);
      await new Promise((r) => setTimeout(r, 50));
      expect(fp.jobs).toHaveLength(1);
      expect(Buffer.from(fp.jobs[0]!)).toEqual(Buffer.from(encoded));
    } finally {
      await fp.stop();
    }
  });
});

// Fiş kodlayıcı artık @ramos/shared'da (packages/shared/src/escpos.ts) — web'deki tablet istasyonu ve
// Epson SDP de aynı kodu kullanır. Bu dosya ajanın mevcut içe aktarımları için ince bir yeniden dışa aktarmadır.
export { CODEPAGE_TABLE, encodeLines, isSupportedCodepage, knownCodepagePairs, type EncodeOptions } from '@ramos/shared';

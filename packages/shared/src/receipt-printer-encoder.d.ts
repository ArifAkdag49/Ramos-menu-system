// @point-of-sale/receipt-printer-encoder 3.0.3 ships no type declarations (its
// package.json "exports" has no "types" condition and dist/ has no .d.ts).
// This is a minimal ambient declaration covering only the API surface this
// package actually calls — see the installed README/dist for the full API.
declare module '@point-of-sale/receipt-printer-encoder' {
  export interface ReceiptPrinterEncoderOptions {
    language?: 'esc-pos' | 'star-line' | 'star-prnt';
    printerModel?: string;
    columns?: number;
    codepageMapping?: Record<string, number> | string;
    codepageCandidates?: string[] | null;
    embedded?: boolean;
    errors?: 'relaxed' | 'strict';
  }

  export default class ReceiptPrinterEncoder {
    constructor(options?: ReceiptPrinterEncoderOptions);
    initialize(): this;
    codepage(value: string): this;
    text(value: string): this;
    line(value: string): this;
    newline(count?: number): this;
    bold(value?: boolean): this;
    underline(value?: boolean | number): this;
    italic(value?: boolean): this;
    invert(value?: boolean): this;
    width(value?: number): this;
    height(value?: number): this;
    size(width?: number | string, height?: number): this;
    align(value: 'left' | 'center' | 'right'): this;
    rule(options?: { style?: 'single' | 'double'; width?: number }): this;
    raw(data: number[] | Uint8Array): this;
    cut(value?: 'full' | 'partial'): this;
    encode(format?: 'commands' | 'lines' | 'array'): Uint8Array;
  }
}

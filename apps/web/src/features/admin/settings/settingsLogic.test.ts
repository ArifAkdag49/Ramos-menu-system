import { describe, expect, it } from 'vitest';
import type { SettingsRow } from '../../../data/settings';
import {
  addRow,
  CODEPAGES,
  codepageChoices,
  codepageValue,
  formFromSettings,
  isSettingsDirty,
  moveRow,
  parseCodepageValue,
  parseQuickNotes,
  removeRow,
  settingsPatch,
  settingsPreviewPayload,
  updateRow,
  validateSettings,
  type SettingsForm,
} from './settingsLogic';

// --- Plan testleri (Görev 24, birebir) ---------------------------------------------------------
const ok = {
  printer_host: '192.168.1.50',
  printer_port: 9100,
  ticket_header: "RAMO'S · KÜCHE",
  business_day_start: '05:00',
};
describe('validateSettings', () => {
  it('geçerli', () => expect(validateSettings(ok)).toEqual({}));
  it('boş host kabul (henüz kurulmadı), hatalı IP/port/başlık/saat reddedilir', () => {
    expect(validateSettings({ ...ok, printer_host: '' })).toEqual({});
    expect(
      validateSettings({
        ...ok,
        printer_host: '999.1.1.1',
        printer_port: 70000,
        ticket_header: ' ',
        business_day_start: '25:00',
      }),
    ).toEqual({
      printer_host: 'host_invalid',
      printer_port: 'port_invalid',
      ticket_header: 'header_empty',
      business_day_start: 'time_invalid',
    });
  });
});

// --- Kenar durumları -----------------------------------------------------------------------------
describe('validateSettings — yazıcı adresi', () => {
  const host = (printer_host: string) => validateSettings({ ...ok, printer_host }).printer_host;

  it.each([
    '0.0.0.0',
    '255.255.255.255',
    '10.0.0.7',
    'xprinter',
    'drucker.local',
    'pos-1.lan',
    '  192.168.1.50  ',
  ])('%s geçerli', (h) => expect(host(h)).toBeUndefined());

  it('yalnız boşluk da "henüz kurulmadı" sayılır', () => expect(host('   ')).toBeUndefined());

  it.each([
    '256.1.1.1',
    '192.168.1',
    '192.168.1.1.1',
    '192.168.01.500',
    '1.2.3.-4',
    'http://192.168.1.50',
    '192.168.1.50:9100',
    'drucker lokal',
    '-drucker',
    'drucker-.lan',
    'a..b',
    '.lan',
    'ş.lan',
    'a'.repeat(64),
    `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.lan`,
  ])('%s geçersiz', (h) => expect(host(h)).toBe('host_invalid'));
});

describe('validateSettings — port', () => {
  const port = (printer_port: number | string) =>
    validateSettings({ ...ok, printer_port }).printer_port;
  it.each([1, 9100, 65535, '9100', ' 9100 '])('%s geçerli', (p) => expect(port(p)).toBeUndefined());
  it.each([0, -1, 65536, 91.5, Number.NaN, '', 'abc', '9e3', '91 00'])('%s geçersiz', (p) =>
    expect(port(p)).toBe('port_invalid'),
  );
});

describe('validateSettings — başlık ve saat', () => {
  it('fiş başlığı 48 kolonu (bir satır) aşamaz', () => {
    expect(validateSettings({ ...ok, ticket_header: 'X'.repeat(48) })).toEqual({});
    expect(validateSettings({ ...ok, ticket_header: 'X'.repeat(49) })).toEqual({
      ticket_header: 'header_too_long',
    });
  });

  it.each(['00:00', '04:30', '23:59'])('saat %s geçerli', (s) =>
    expect(validateSettings({ ...ok, business_day_start: s })).toEqual({}),
  );
  it.each(['24:00', '5:00', '05:60', '05:00:00', '', 'abc'])('saat %s geçersiz', (s) =>
    expect(validateSettings({ ...ok, business_day_start: s })).toEqual({
      business_day_start: 'time_invalid',
    }),
  );

  it('restoran adı verilirse boş olamaz', () =>
    expect(validateSettings({ ...ok, restaurant_name: '  ' })).toEqual({
      restaurant_name: 'name_empty',
    }));
});

describe('validateSettings — listeler', () => {
  it('boş DE metni satırında hata; TR boş kalabilir', () =>
    expect(
      validateSettings({
        ...ok,
        quick_notes: [
          { de: 'gut durch', tr: '' },
          { de: ' ', tr: 'İyi pişmiş' },
        ],
        cancel_reasons: [{ de: '', tr: 'Diğer', freeText: true }],
      }),
    ).toEqual({ 'quick_notes.1.de': 'text_empty', 'cancel_reasons.0.de': 'text_empty' }));

  it('alerjen kodu boş, virgüllü/boşluklu ya da tekrar edemez; adı boş olamaz', () =>
    expect(
      validateSettings({
        ...ok,
        allergen_legend: [
          { code: 'a', de: 'Gluten', tr: '' },
          { code: ' a ', de: 'Eier', tr: '' },
          { code: '', de: 'Fisch', tr: '' },
          { code: 'b,c', de: 'Soja', tr: '' },
          { code: '10', de: '', tr: '' },
        ],
      }),
    ).toEqual({
      'allergen_legend.1.code': 'code_duplicate',
      'allergen_legend.2.code': 'code_empty',
      'allergen_legend.3.code': 'code_invalid',
      'allergen_legend.4.de': 'text_empty',
    }));
});

describe('karakter tablosu', () => {
  it('varsayılan cp857/61 ilk seçenektir; kod sayfası ve numara birlikte gider', () => {
    expect(CODEPAGES.map((c) => codepageValue(c.codepage, c.number))).toEqual([
      'cp857/61',
      'windows1254/91',
      'cp858/19',
      'cp437/0',
    ]);
    expect(parseCodepageValue('windows1254/91')).toEqual({ codepage: 'windows1254', number: 91 });
  });

  it('bozuk değer okunmaz', () => {
    expect(parseCodepageValue('cp857')).toBeNull();
    expect(parseCodepageValue('/61')).toBeNull();
    expect(parseCodepageValue('cp857/256')).toBeNull();
  });

  it('listede olmayan kayıtlı değer seçeneklerin sonuna eklenir (sessizce değişmez)', () => {
    expect(codepageChoices('cp857/61')).toHaveLength(4);
    expect(codepageChoices('windows1252/16')).toEqual([
      'cp857/61',
      'windows1254/91',
      'cp858/19',
      'cp437/0',
      'windows1252/16',
    ]);
  });
});

describe('parseQuickNotes', () => {
  it('bozuk girdiyi atar, TR yoksa boş metin', () =>
    expect(
      parseQuickNotes([
        { de: 'gut durch', tr: 'İyi pişmiş' },
        { de: 'wenig Soße' },
        { tr: 'x' },
        5,
        null,
      ]),
    ).toEqual([
      { de: 'gut durch', tr: 'İyi pişmiş' },
      { de: 'wenig Soße', tr: '' },
    ]));
  it('dizi değilse boş', () => expect(parseQuickNotes({})).toEqual([]));
});

describe('liste düzenleyici yardımcıları', () => {
  const list = [{ k: 'a' }, { k: 'b' }, { k: 'c' }];

  it('addRow sona ekler, orijinali değiştirmez', () => {
    const next = addRow(list, { k: 'd' });
    expect(next.map((x) => x.k)).toEqual(['a', 'b', 'c', 'd']);
    expect(list).toHaveLength(3);
  });

  it('removeRow verilen sırayı siler; sınır dışı dokunmaz', () => {
    expect(removeRow(list, 1).map((x) => x.k)).toEqual(['a', 'c']);
    expect(removeRow(list, 5)).toBe(list);
    expect(removeRow(list, -1)).toBe(list);
  });

  it('moveRow yukarı/aşağı taşır; uçta aynı diziyi döner', () => {
    expect(moveRow(list, 0, 1).map((x) => x.k)).toEqual(['b', 'a', 'c']);
    expect(moveRow(list, 2, -1).map((x) => x.k)).toEqual(['a', 'c', 'b']);
    expect(moveRow(list, 0, -1)).toBe(list);
    expect(moveRow(list, 2, 1)).toBe(list);
    expect(list.map((x) => x.k)).toEqual(['a', 'b', 'c']);
  });

  it('updateRow yalnız o satırı günceller', () => {
    const next = updateRow(list, 2, { k: 'z' });
    expect(next.map((x) => x.k)).toEqual(['a', 'b', 'z']);
    expect(next[0]).toBe(list[0]);
    expect(updateRow(list, 9, { k: 'z' })).toBe(list);
  });
});

const row = (over: Partial<SettingsRow> = {}): SettingsRow => ({
  id: 1,
  restaurant_name: "Ramo's Döner & Grill House",
  ticket_header: "RAMO'S · KÜCHE",
  ticket_footer: '',
  business_day_start: '05:00:00',
  printer_host: '192.168.1.50',
  printer_port: 9100,
  printer_codepage: 'cp857',
  printer_codepage_number: 61,
  printer_transliterate: false,
  quick_notes: [{ de: 'gut durch', tr: 'İyi pişmiş' }],
  cancel_reasons: [
    { de: 'Gast hat storniert', tr: 'Müşteri vazgeçti' },
    { de: 'Sonstiges', tr: 'Diğer', freeText: true },
  ],
  allergen_legend: [{ code: 'a', de: 'Glutenhaltiges Getreide', tr: 'Glutenli tahıl' }],
  updated_at: '2026-09-17T10:00:00Z',
  updated_by: null,
  ...over,
});

describe('formFromSettings / settingsPatch', () => {
  it('saat sütunu formda HH:MM olur, port metin, karakter tablosu tek değer', () => {
    const form = formFromSettings(row());
    expect(form.business_day_start).toBe('05:00');
    expect(form.printer_port).toBe('9100');
    expect(form.codepage).toBe('cp857/61');
    expect(form.cancel_reasons[1]).toMatchObject({ de: 'Sonstiges', tr: 'Diğer', freeText: true });
    expect(new Set(form.quick_notes.map((r) => r.key)).size).toBe(form.quick_notes.length);
  });

  it('kayıtlı biçime döner: metinler kırpılır, boş TR ve kapalı bayrak yazılmaz, anahtarlar atılır', () => {
    const form: SettingsForm = {
      ...formFromSettings(row()),
      restaurant_name: '  Ramo’s  ',
      ticket_header: "  RAMO'S  ",
      ticket_footer: ' Guten Appetit ',
      printer_host: ' 192.168.1.60 ',
      printer_port: ' 9101 ',
      codepage: 'windows1254/91',
      printer_transliterate: true,
      business_day_start: '04:30',
      quick_notes: [{ key: 'x', de: ' extra Soße ', tr: ' ' }],
      cancel_reasons: [{ key: 'y', de: 'Sonstiges', tr: '', freeText: false }],
      allergen_legend: [{ key: 'z', code: ' 10 ', de: 'chininhaltig', tr: 'Kininli' }],
    };
    expect(settingsPatch(form)).toEqual({
      restaurant_name: 'Ramo’s',
      business_day_start: '04:30',
      ticket_header: "RAMO'S",
      ticket_footer: 'Guten Appetit',
      printer_host: '192.168.1.60',
      printer_port: 9101,
      printer_codepage: 'windows1254',
      printer_codepage_number: 91,
      printer_transliterate: true,
      quick_notes: [{ de: 'extra Soße' }],
      cancel_reasons: [{ de: 'Sonstiges' }],
      allergen_legend: [{ code: '10', de: 'chininhaltig', tr: 'Kininli' }],
    });
  });

  it('okunan satır değiştirilmeden kaydedilirse değişiklik yoktur', () => {
    const r = row();
    expect(isSettingsDirty(formFromSettings(r), r)).toBe(false);
  });

  it('yalnız kırpılınca eşit olan değer değişiklik sayılmaz; gerçek değişiklik sayılır', () => {
    const r = row();
    const form = formFromSettings(r);
    expect(isSettingsDirty({ ...form, ticket_header: ` ${form.ticket_header} ` }, r)).toBe(false);
    expect(isSettingsDirty({ ...form, printer_port: '9101' }, r)).toBe(true);
    expect(
      isSettingsDirty(
        {
          ...form,
          quick_notes: moveRow([...form.quick_notes, { key: 'n', de: 'x', tr: '' }], 1, -1),
        },
        r,
      ),
    ).toBe(true);
  });

  it('bozuk JSON listeleri boş liste olarak açılır (ekran çökmez)', () => {
    const form = formFromSettings(
      row({ quick_notes: 'x', cancel_reasons: null, allergen_legend: {} }),
    );
    expect(form.quick_notes).toEqual([]);
    expect(form.cancel_reasons).toEqual([]);
    expect(form.allergen_legend).toEqual([]);
  });
});

describe('settingsPreviewPayload', () => {
  it('başlık ve altlık önizlemeye kırpılmış gider; boş altlık basılmaz', () => {
    const p = settingsPreviewPayload(' RAMO ', '  ', new Date('2026-09-17T18:00:00Z'));
    expect(p.header).toBe('RAMO');
    expect(p.footer).toBeUndefined();
    expect(p.kind).toBe('order');
    expect(p.items.length).toBeGreaterThan(0);
    expect(settingsPreviewPayload('A', ' Danke ', new Date()).footer).toBe('Danke');
  });
});

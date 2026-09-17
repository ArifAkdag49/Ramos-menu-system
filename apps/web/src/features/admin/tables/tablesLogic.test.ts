import { describe, expect, it } from 'vitest';
import { changedTables, suggestTableName, tableNameError } from './tablesLogic';

describe('suggestTableName ("Tisch N" önerisi)', () => {
  it('en büyük numaranın bir fazlası', () =>
    expect(suggestTableName(['Tisch 1', 'Tisch 12', 'Tisch 3'])).toBe('Tisch 13'));

  it('sıra değil numara belirler; boşluklar doldurulmaz', () =>
    expect(suggestTableName(['Tisch 9', 'Tisch 2'])).toBe('Tisch 10'));

  it('"Tisch N" biçiminde olmayan adlar sayılmaz (Test-Tisch-2, Terrasse)', () =>
    expect(suggestTableName(['Test-Tisch', 'Test-Tisch-2', 'Terrasse', 'Tisch 4'])).toBe(
      'Tisch 5',
    ));

  it('hiç numaralı masa yoksa Tisch 1', () => {
    expect(suggestTableName([])).toBe('Tisch 1');
    expect(suggestTableName(['Bar', 'Garten'])).toBe('Tisch 1');
  });

  it('fazla boşluk ve küçük harf de tanınır', () =>
    expect(suggestTableName(['  tisch   7 '])).toBe('Tisch 8'));
});

describe('tableNameError', () => {
  const rows = [
    { key: 'a', name: 'Tisch 1' },
    { key: 'b', name: 'Tisch 2' },
  ];

  it('boş ad → required', () => expect(tableNameError('   ', 'x', rows)).toBe('required'));

  it('başka satırla aynı ad (büyük/küçük harf ve boşluk fark etmez) → taken', () =>
    expect(tableNameError(' tisch 2 ', 'a', rows)).toBe('taken'));

  it('satırın kendi adı çakışma sayılmaz', () =>
    expect(tableNameError('Tisch 1', 'a', rows)).toBeNull());

  it('40 karakterden uzun → too_long', () =>
    expect(tableNameError('x'.repeat(41), 'a', rows)).toBe('too_long'));
});

describe('changedTables (yalnız değişen satırlar yazılır)', () => {
  const server = [
    { id: 't1', name: 'Tisch 1', sort: 10, is_active: true },
    { id: 't2', name: 'Tisch 2', sort: 20, is_active: true },
  ];

  it('hiçbir şey değişmediyse boş', () =>
    expect(
      changedTables(server, [
        { key: 't1', id: 't1', name: 'Tisch 1', is_active: true },
        { key: 't2', id: 't2', name: 'Tisch 2', is_active: true },
      ]),
    ).toEqual({ inserts: [], updates: [] }));

  // Canlı veride sıralar 10'un katı olmayabilir (seed 1…12, fikstür 900/901). Sıra bozulmadıysa
  // kaydetmek bütün masaları yeniden numaralamamalı — her biri ayrı bir denetim satırı olurdu.
  it('sıra değişmediyse mevcut sort değerleri korunur, sona eklenen masa en büyük sıra + 10 alır', () =>
    expect(
      changedTables(
        [
          { id: 't1', name: 'Tisch 1', sort: 1, is_active: true },
          { id: 't2', name: 'Tisch 2', sort: 2, is_active: true },
          { id: 'x', name: 'Test-Tisch', sort: 900, is_active: false },
        ],
        [
          { key: 't1', id: 't1', name: 'Tisch 1', is_active: true },
          { key: 't2', id: 't2', name: 'Tisch 2 neu', is_active: true },
          { key: 'x', id: 'x', name: 'Test-Tisch', is_active: false },
          { key: 'n1', name: 'Tisch 3', is_active: true },
          { key: 'n2', name: 'Tisch 4', is_active: false },
        ],
      ),
    ).toEqual({
      inserts: [
        { name: 'Tisch 3', sort: 910, is_active: true },
        { name: 'Tisch 4', sort: 920, is_active: false },
      ],
      updates: [{ id: 't2', name: 'Tisch 2 neu', sort: 2, is_active: true }],
    }));

  it('yeni masa araya taşınırsa liste yeniden numaralanır', () =>
    expect(
      changedTables(server, [
        { key: 't1', id: 't1', name: 'Tisch 1', is_active: true },
        { key: 'n', name: 'Tisch 1a', is_active: true },
        { key: 't2', id: 't2', name: 'Tisch 2', is_active: true },
      ]),
    ).toEqual({
      inserts: [{ name: 'Tisch 1a', sort: 20, is_active: true }],
      updates: [{ id: 't2', name: 'Tisch 2', sort: 30, is_active: true }],
    }));

  it('sıra değişince iki satırın sort değeri yazılır, ad kırpılır, yeni satır eklenir', () =>
    expect(
      changedTables(server, [
        { key: 't2', id: 't2', name: 'Tisch 2 ', is_active: true },
        { key: 't1', id: 't1', name: 'Tisch 1', is_active: false },
        { key: 'yeni', name: ' Tisch 3', is_active: true },
      ]),
    ).toEqual({
      inserts: [{ name: 'Tisch 3', sort: 30, is_active: true }],
      updates: [
        { id: 't2', name: 'Tisch 2', sort: 10, is_active: true },
        { id: 't1', name: 'Tisch 1', sort: 20, is_active: false },
      ],
    }));
});

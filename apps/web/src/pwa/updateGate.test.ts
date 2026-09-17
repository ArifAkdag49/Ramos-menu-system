import { describe, expect, it } from 'vitest';
import { markCriticalWork } from '../lib/busy';
import { useOverlay } from '../lib/overlay';
import { canApplyUpdate, readGate, type UpdateGate } from './updateGate';

const gate = (patch: Partial<UpdateGate> = {}): UpdateGate => ({
  mutating: 0,
  criticalWork: false,
  openSheets: 0,
  typing: false,
  hidden: false,
  ...patch,
});

describe('canApplyUpdate — yeni sürüm şimdi devreye alınabilir mi', () => {
  it('ekranda iş yokken evet', () => {
    expect(canApplyUpdate(gate())).toBe(true);
  });

  it('sunucuya yazan bir istek sürerken hayır (sipariş yarıda kalmasın)', () => {
    expect(canApplyUpdate(gate({ mutating: 1 }))).toBe(false);
    expect(canApplyUpdate(gate({ mutating: 1, hidden: true }))).toBe(false);
  });

  it('bölünmemesi gereken iş (fiş basılıyor) sürerken hayır', () => {
    expect(canApplyUpdate(gate({ criticalWork: true }))).toBe(false);
    expect(canApplyUpdate(gate({ criticalWork: true, hidden: true }))).toBe(false);
  });

  it('açık panel varken ya da yazı yazılırken hayır', () => {
    expect(canApplyUpdate(gate({ openSheets: 1 }))).toBe(false);
    expect(canApplyUpdate(gate({ typing: true }))).toBe(false);
  });

  it('uygulama arka plandayken açık panel/yazı engel değildir — kimse bakmıyor', () => {
    expect(canApplyUpdate(gate({ hidden: true, openSheets: 1, typing: true }))).toBe(true);
  });
});

describe('readGate — ekranın gerçek durumu', () => {
  it('açık panel ve odaktaki yazı alanı okunur', () => {
    expect(readGate()).toMatchObject({ openSheets: 0, typing: false, criticalWork: false });

    useOverlay.getState().push();
    expect(readGate().openSheets).toBe(1);
    useOverlay.getState().pop();

    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    // Boş alan engel değil (giriş ekranı PIN alanını kendiliğinden odaklar), dolu alan engel.
    expect(readGate().typing).toBe(false);
    input.value = '12';
    expect(readGate().typing).toBe(true);
    input.remove();

    const release = markCriticalWork();
    expect(readGate().criticalWork).toBe(true);
    release();
    expect(readGate().criticalWork).toBe(false);
  });
});

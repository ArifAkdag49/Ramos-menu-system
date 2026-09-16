import { describe, expect, it } from 'vitest';
import { keysForTopic } from './realtime';

describe('keysForTopic', () => {
  it('orders olayı masa, oturum, sipariş ve hesap önbelleğini tazeler', () =>
    expect(keysForTopic('orders')).toEqual([['tables'], ['session'], ['orders'], ['bill']]));
  it('menu olayı menüyü ve masaları tazeler', () => expect(keysForTopic('menu')).toEqual([['menu'], ['tables']]));
  it('printer-status ve settings kendi anahtarlarını', () => {
    expect(keysForTopic('printer-status')).toEqual([['printer-status']]);
    expect(keysForTopic('settings')).toEqual([['settings']]);
  });
});

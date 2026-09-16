import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from './Stepper';

const show = (value = 2) =>
  render(
    <Stepper
      value={value}
      onChange={vi.fn()}
      decreaseLabel="Adedi azalt"
      increaseLabel="Adedi artır"
      valueLabel={`Adet ${value}`}
    />,
  );

/**
 * O7 (M3 tasarım kapısı, axe `aria-prohibited-attr`): sayı jenerik bir `span`'da
 * `aria-label="Adet 2"` taşıyordu. ARIA 1.2 jenerik öğede `aria-label`'ı **yasaklar**; ekran
 * okuyucular yok sayar, yani adet değişimi ya hiç ya da bağlamsız ("2") duyurulur. Görünen sayı
 * dekoratif hâle gelir, duyuru görünmez bir canlı bölgeden yapılır.
 */
describe('Stepper — adet duyurusu (O7)', () => {
  it('görünen sayı ekran okuyucudan gizlenir', () => {
    show();
    expect(screen.getByText('2')).toHaveAttribute('aria-hidden', 'true');
  });

  it('adet bağlamıyla birlikte canlı bölgeden duyurulur', () => {
    show();
    expect(screen.getByRole('status')).toHaveTextContent('Adet 2');
  });

  it('jenerik öğede `aria-label` kalmadı', () => {
    const { container } = show();
    expect(container.querySelectorAll('span[aria-label], div[aria-label], p[aria-label]')).toHaveLength(0);
  });

  it('düğmeler etiketli kalır', () => {
    show();
    expect(screen.getByRole('button', { name: 'Adedi artır' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adedi azalt' })).toBeInTheDocument();
  });
});

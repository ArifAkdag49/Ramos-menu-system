import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('M6: etiketsizken tamamen süs olur — rol vermez, gizlenir', () => {
    const { container } = render(<Spinner />);
    const el = container.querySelector('span');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).not.toHaveAttribute('role');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('etiketliyken durum olarak duyurulur', () => {
    render(<Spinner label="Yükleniyor" />);
    const el = screen.getByRole('status', { name: 'Yükleniyor' });
    expect(el).not.toHaveAttribute('aria-hidden');
  });
});

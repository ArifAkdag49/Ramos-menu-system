import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toast } from './Toast';

describe('Toast', () => {
  it('M5: mesaj yokken bile canlı bölge monte kalır', () => {
    render(<Toast />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
  });

  it('mesaj aynı canlı bölgenin içine yazılır', () => {
    render(<Toast>Mutfağa gönderildi</Toast>);
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('Mutfağa gönderildi');
  });
});

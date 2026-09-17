import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import { usePwaUpdate } from './updateStore';
import { UpdatePrompt } from './UpdatePrompt';

beforeEach(() => usePwaUpdate.setState({ update: null }));

describe('<UpdatePrompt />', () => {
  it('yeni sürüm yokken görünmez', () => {
    render(<UpdatePrompt />);
    expect(screen.queryByText('Yeni sürüm hazır')).not.toBeInTheDocument();
  });

  it('"Yenile" bekleyen sürümü etkinleştirir', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    usePwaUpdate.setState({ update });
    render(<UpdatePrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Yenile' }));
    expect(update).toHaveBeenCalledOnce();
  });

  it('kapatılabilir', async () => {
    usePwaUpdate.setState({ update: vi.fn() });
    render(<UpdatePrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByText('Yeni sürüm hazır')).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pushMock } from '../../../vitest.setup';

const apiMock = vi.fn();
const setTokenMock = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...a: any[]) => apiMock(...a),
  setToken: (...a: any[]) => setTokenMock(...a),
}));

import LoginPage from './page';

describe('LoginPage', () => {
  beforeEach(() => {
    apiMock.mockReset();
    setTokenMock.mockReset();
  });

  it('renders the login form', () => {
    render(<LoginPage />);
    expect(screen.getByText('Sentinel Control Center')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('submits credentials, stores token and redirects', async () => {
    apiMock.mockResolvedValue({ accessToken: 'tok-1' });
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.com', password: 'secret' }),
      });
    });
    expect(setTokenMock).toHaveBeenCalledWith('tok-1');
    expect(pushMock).toHaveBeenCalledWith('/overview');
  });

  it('shows an error message when login fails', async () => {
    apiMock.mockRejectedValue(new Error('Email atau password salah'));
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Password'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('Email atau password salah'),
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});

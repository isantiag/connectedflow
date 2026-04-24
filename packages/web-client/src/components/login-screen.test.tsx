import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoginScreen } from './login-screen';

const mockLogin = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ login: mockLogin, user: null, token: null, logout: vi.fn(), loading: false }),
}));

beforeEach(() => { mockLogin.mockReset(); });

describe('LoginScreen', () => {
  it('renders email and password fields', () => {
    render(<LoginScreen />);
    expect(screen.getByPlaceholderText('Email address')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
  });

  it('renders sign in button', () => {
    render(<LoginScreen />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('calls login with email and password on submit', async () => {
    mockLogin.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(screen.getByPlaceholderText('Email address'), 'admin@enteraero.com');
    await user.type(screen.getByPlaceholderText('Password'), 'Admin1!');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockLogin).toHaveBeenCalledWith('admin@enteraero.com', 'Admin1!');
  });

  it('shows error message on failed login', async () => {
    mockLogin.mockResolvedValue('Invalid credentials');
    const user = userEvent.setup();
    render(<LoginScreen />);

    await user.type(screen.getByPlaceholderText('Email address'), 'bad@test.com');
    await user.type(screen.getByPlaceholderText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('shows test account credentials', () => {
    render(<LoginScreen />);
    expect(screen.getByText(/admin@enteraero.com/)).toBeInTheDocument();
  });
});

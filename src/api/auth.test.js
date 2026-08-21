import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
};

vi.mock('./client', () => ({ supabase: { auth: mockAuth }, isConfigured: true }));

const { signIn, signUp, signOut, resetPassword } = await import('./auth');
const { toCamel } = await import('./profiles');

beforeEach(() => vi.clearAllMocks());

describe('auth wrapper', () => {
  it('signs in with trimmed lowercase email', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: { user: { id: '1' } }, error: null });
    await signIn('  Amira@Example.COM ', 'pw');
    expect(mockAuth.signInWithPassword)
      .toHaveBeenCalledWith({ email: 'amira@example.com', password: 'pw' });
  });

  it('throws a readable error when sign-in fails', async () => {
    mockAuth.signInWithPassword.mockResolvedValue({ data: null, error: { message: 'Invalid login credentials' } });
    await expect(signIn('a@b.com', 'pw')).rejects.toThrow(/Invalid login credentials/);
  });

  it('passes only the name through signup metadata, never a role', async () => {
    mockAuth.signUp.mockResolvedValue({ data: { user: { id: '1' } }, error: null });
    await signUp({ email: 'a@b.com', password: 'pw', name: 'Amira', role: 'admin' });
    const arg = mockAuth.signUp.mock.calls[0][0];
    expect(arg.options.data).toEqual({ name: 'Amira' });
  });

  it('signs out', async () => {
    mockAuth.signOut.mockResolvedValue({ error: null });
    await signOut();
    expect(mockAuth.signOut).toHaveBeenCalled();
  });

  it('requests a password reset', async () => {
    mockAuth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await resetPassword('a@b.com');
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalled();
  });
});

describe('toCamel', () => {
  it('maps snake_case columns to camelCase', () => {
    expect(toCamel({
      id: 'u1', role: 'trainee', status: 'active', name: 'Amira',
      email: 'a@b.com', avatar: 'AA', created_at: '2026-01-01T00:00:00Z',
    })).toEqual({
      id: 'u1', role: 'trainee', status: 'active', name: 'Amira',
      email: 'a@b.com', avatar: 'AA', createdAt: '2026-01-01T00:00:00Z',
    });
  });

  it('returns null for a missing row', () => {
    expect(toCamel(null)).toBeNull();
  });
});

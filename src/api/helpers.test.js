import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const getSession = vi.fn();
const client = { functions: { invoke }, auth: { getSession } };
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { unwrap, currentUserId, invokeFn } = await import('./helpers');

beforeEach(() => vi.clearAllMocks());

/** A stand-in for the Response supabase-js hangs off FunctionsHttpError. */
const response = (body) => ({
  clone: () => ({ json: () => Promise.resolve(body) }),
  json: () => Promise.resolve(body),
});

describe('unwrap', () => {
  it('returns data', () => {
    expect(unwrap({ data: [1], error: null })).toEqual([1]);
  });
  it('throws the postgres message', () => {
    expect(() => unwrap({ data: null, error: { message: 'denied' } })).toThrow(/denied/);
  });
});

describe('currentUserId', () => {
  it('reads the cached session', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    expect(await currentUserId()).toBe('u1');
  });
  it('throws when nobody is signed in', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(currentUserId()).rejects.toThrow(/Not signed in/);
  });
});

describe('invokeFn', () => {
  it('returns the data on success', async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await invokeFn('fn', { a: 1 })).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith('fn', { body: { a: 1 } });
  });

  it('rejects a 200 that carries an error body', async () => {
    invoke.mockResolvedValue({ data: { error: 'nope' }, error: null });
    await expect(invokeFn('fn', {})).rejects.toThrow(/nope/);
  });

  /**
   * The reason this file exists. supabase-js replaces every non-2xx with a
   * fixed "Edge Function returned a non-2xx status code" and nulls the data,
   * so the message the function actually sent has to be read off the Response
   * hanging on error.context. Without this the last-admin guard, the
   * empty-course refusal and the locked-module message all reach the user as
   * that one meaningless sentence.
   */
  it('digs the real message out of a non-2xx response', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: response({ error: 'Cannot suspend the last active admin' }),
      },
    });
    await expect(invokeFn('admin-suspend-user', {}))
      .rejects.toThrow('Cannot suspend the last active admin');
  });

  it('falls back to the generic message when there is no context', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    await expect(invokeFn('fn', {})).rejects.toThrow('Failed to fetch');
  });

  it('falls back when the body is not JSON', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { clone: () => ({ json: () => Promise.reject(new Error('not json')) }) },
      },
    });
    await expect(invokeFn('fn', {}))
      .rejects.toThrow('Edge Function returned a non-2xx status code');
  });

  it('falls back when the body has no error field', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'generic', context: response({ ok: false }) },
    });
    await expect(invokeFn('fn', {})).rejects.toThrow('generic');
  });

  // Reading a body consumes it. Cloning leaves the Response usable.
  it('does not consume the original response', async () => {
    const json = vi.fn().mockResolvedValue({ error: 'real reason' });
    const clone = vi.fn(() => ({ json: () => Promise.resolve({ error: 'real reason' }) }));
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'generic', context: { clone, json } },
    });
    await expect(invokeFn('fn', {})).rejects.toThrow('real reason');
    expect(clone).toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});

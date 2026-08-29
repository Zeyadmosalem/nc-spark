import { vi } from 'vitest';

/**
 * A stand-in for the PostgREST query builder.
 *
 * Every api test had grown its own copy of this, each supporting whichever
 * chain methods that module happened to use — so a test for a new module
 * started by rediscovering which ones were missing. This supports the whole
 * vocabulary the codebase uses, and records the calls so a test can assert
 * the filter as well as the result.
 *
 * `then` is what makes it awaitable: PostgREST builders are thenables, not
 * promises, which is why a plain object works here at all.
 */
export function chain(result, calls = []) {
  const record = (name) => (...args) => { calls.push([name, ...args]); return obj; };
  const obj = {
    calls,
    select: record('select'),
    insert: record('insert'),
    update: record('update'),
    upsert: record('upsert'),
    delete: record('delete'),
    eq: record('eq'),
    neq: record('neq'),
    in: record('in'),
    is: record('is'),
    not: record('not'),
    gte: record('gte'),
    lte: record('lte'),
    like: record('like'),
    ilike: record('ilike'),
    order: record('order'),
    limit: record('limit'),
    range: record('range'),
    single: record('single'),
    maybeSingle: record('maybeSingle'),
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return obj;
}

/** Finds one recorded call by name, for asserting the filter that was sent. */
export const callTo = (builder, name) =>
  builder.calls.find(([called]) => called === name);

/**
 * A whole supabase client stub. Pass it to vi.mock('./client', ...).
 *
 * `signedInAs` matters more than it looks: currentUserId reads the local
 * session, so a module that narrows a query by the caller's id gets undefined
 * without it and the assertion drifts to a filter on nothing.
 */
export function makeClient({ signedInAs = 'me' } = {}) {
  const from = vi.fn();
  const invoke = vi.fn();
  const getSession = vi.fn().mockResolvedValue({
    data: { session: signedInAs ? { user: { id: signedInAs } } : null },
  });

  const client = {
    from,
    auth: { getSession },
    functions: { invoke },
    storage: { from: vi.fn() },
  };

  return { client, from, invoke, getSession };
}

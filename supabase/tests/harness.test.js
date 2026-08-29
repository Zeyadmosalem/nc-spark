// The test harness's own retry.
//
// By definition this code only runs when something else is broken, so without
// a test it is unexercised until the night it matters — which is how it was
// missing in the first place. fetch is stubbed here; nothing touches the
// network or the database.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { callFunction } from './helpers.js';

/** Just enough client for callFunction: it only reads the access token. */
const client = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'a-token' } } }) },
};

const jsonResponse = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

afterEach(() => vi.unstubAllGlobals());

describe('callFunction', () => {
  it('returns the status and body of a call that works', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { ok: true })));

    expect(await callFunction('publish-course', client, { courseId: 'x' }))
      .toEqual({ status: 200, body: { ok: true } });
  });

  it('sends the caller\'s token to the named function', async () => {
    const spy = vi.fn(async () => jsonResponse(200, {}));
    vi.stubGlobal('fetch', spy);

    await callFunction('admin-set-role', client, { role: 'trainer' });

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/functions/v1/admin-set-role');
    expect(init.headers.Authorization).toBe('Bearer a-token');
    expect(JSON.parse(init.body)).toEqual({ role: 'trainer' });
  });

  /**
   * The whole point. A single transport blip took a file's beforeAll with it
   * and was recorded as an unreproducible failure (B12).
   */
  it('retries a transport failure and succeeds', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new TypeError('fetch failed');
      return jsonResponse(200, { ok: true });
    }));

    expect(await callFunction('start-quiz', client, {}))
      .toEqual({ status: 200, body: { ok: true } });
    expect(calls).toBe(3);
  });

  /**
   * A 5xx is the function's own answer, not a transport failure. Retrying it
   * would hide the bug the calling test exists to find.
   */
  it('does not retry a status, however bad', async () => {
    const spy = vi.fn(async () => jsonResponse(500, { error: 'boom' }));
    vi.stubGlobal('fetch', spy);

    expect(await callFunction('grade-paragraph', client, {}))
      .toEqual({ status: 500, body: { error: 'boom' } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  /** Naming the function is what turns the next occurrence into a report. */
  it('names the function it could not reach when it gives up', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));

    await expect(callFunction('approve-enrollment', client, {}, 2))
      .rejects.toThrow(/approve-enrollment could not be reached after 2 attempts: fetch failed/);
  });

  it('survives a body that is not json', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gateway timeout', { status: 504 })));

    expect(await callFunction('publish-course', client, {}))
      .toEqual({ status: 504, body: null });
  });
});

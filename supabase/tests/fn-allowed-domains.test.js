// The domain allowlist, through the real api layer.
//
// allowed_domains has RLS enabled and NO policy, so no browser session can
// read or write it — only the service role, which bypasses RLS. Every
// operation goes through admin-allowed-domains. That makes the function the
// only door, and the only place worth testing: a mocked frontend test cannot
// tell whether the door is locked.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serviceClient, createUser, uniqueEmail, applyAppEnv } from './helpers.js';

applyAppEnv();

const { supabase } = await import('../../src/api/client.js');
const { listAllowedDomains, addAllowedDomain, removeAllowedDomain, recentAudit } =
  await import('../../src/api/admin.js');

const svc = serviceClient();
const PASSWORD = 'Test-Passw0rd!';
const DOMAIN = `t${Date.now()}.example`;

let admin, trainee;
const madeUsers = [];

async function become(email) {
  await supabase.auth.signOut();
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`could not sign in as ${email}: ${error.message}`);
}

async function mk(role) {
  const u = await createUser({ email: uniqueEmail(), role });
  madeUsers.push(u.id);
  return u;
}

beforeAll(async () => {
  admin = await mk('admin');
  trainee = await mk('trainee');
}, 60000);

afterAll(async () => {
  await supabase.auth.signOut();
  await svc.from('allowed_domains').delete().like('domain', 't%.example');
  for (const id of madeUsers) {
    await svc.auth.admin.deleteUser(id).catch(() => null);
  }
});

describe('an admin', () => {
  beforeAll(() => become(admin.email));

  it('adds a domain and reads it back', async () => {
    await addAllowedDomain(DOMAIN);
    const list = await listAllowedDomains();
    expect(list.map((d) => d.domain)).toContain(DOMAIN);
  });

  /**
   * The column has a `domain = lower(domain)` check, and a stray space or a
   * pasted "@" is the difference between allowlisting a company and silently
   * allowlisting nothing.
   */
  it('normalises case, whitespace and a leading at-sign', async () => {
    const messy = `  @UPPER${DOMAIN}  `;
    await addAllowedDomain(messy);
    const list = await listAllowedDomains();
    expect(list.map((d) => d.domain)).toContain(`upper${DOMAIN}`);
  });

  // Already allowlisted is the outcome the caller wanted, not a failure.
  it('treats adding the same domain twice as success', async () => {
    await expect(addAllowedDomain(DOMAIN)).resolves.toBeTruthy();
    const list = await listAllowedDomains();
    expect(list.filter((d) => d.domain === DOMAIN)).toHaveLength(1);
  });

  it.each(['not a domain', 'no-tld', '.leading.dot', 'trailing.dot.', 'a@b.com', ''])(
    'refuses %s', async (bad) => {
      await expect(addAllowedDomain(bad)).rejects.toThrow(/not a valid domain|required|action/i);
    },
  );

  /**
   * The audit trail is the reason this is a function rather than a policy: an
   * allowlisted domain hands out active accounts, so who added it matters.
   */
  it('records who changed the list', async () => {
    const entries = await recentAudit(50);
    const added = entries.find(
      (e) => e.action === 'allowed_domain.added' && e.entityId === DOMAIN);
    expect(added).toBeDefined();
    expect(added.actorEmail).toBe(admin.email);
  });

  it('removes a domain', async () => {
    await removeAllowedDomain(`upper${DOMAIN}`);
    const list = await listAllowedDomains();
    expect(list.map((d) => d.domain)).not.toContain(`upper${DOMAIN}`);
  });

  it('says so when removing something that is not there', async () => {
    await expect(removeAllowedDomain('nothere.example')).rejects.toThrow(/not on the list/);
  });
});

describe('a trainee', () => {
  beforeAll(() => become(trainee.email));

  // Not vacuous: the same three calls all succeed for the admin above.
  it('cannot read the list', async () => {
    await expect(listAllowedDomains()).rejects.toThrow();
  });

  it('cannot add a domain', async () => {
    await expect(addAllowedDomain('mine.example')).rejects.toThrow();
    const { data } = await svc.from('allowed_domains').select('domain').eq('domain', 'mine.example');
    expect(data).toHaveLength(0);
  });

  it('cannot remove one', async () => {
    await removeAllowedDomain(DOMAIN).catch(() => null);
    const { data } = await svc.from('allowed_domains').select('domain').eq('domain', DOMAIN);
    expect(data).toHaveLength(1);
  });

  /**
   * The table itself, not the function. RLS is on with no policy, so this must
   * come back empty rather than merely being awkward to reach.
   */
  it('cannot read the table directly either', async () => {
    const { data } = await supabase.from('allowed_domains').select('domain');
    expect(data ?? []).toEqual([]);
  });
});

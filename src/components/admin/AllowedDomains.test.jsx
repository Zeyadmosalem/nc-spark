import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useAllowedDomains: vi.fn(), add: vi.fn(), remove: vi.fn(),
  state: { add: { isPending: false, error: null } },
}));

const asMutation = (spy, extra = {}) => ({
  mutate: spy, isPending: false, error: null, ...extra,
});

vi.mock('../../hooks/useAdmin', () => ({
  useAllowedDomains: mocks.useAllowedDomains,
  useAddAllowedDomain: () => asMutation(mocks.add, mocks.state.add),
  useRemoveAllowedDomain: () => asMutation(mocks.remove),
}));

const AllowedDomains = (await import('./AllowedDomains')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });
const varsOf = (spy) => spy.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAllowedDomains.mockReturnValue(query([]));
  mocks.state.add = { isPending: false, error: null };
});

describe('the list', () => {
  it('shows each domain and what it means', () => {
    mocks.useAllowedDomains.mockReturnValue(query([
      { domain: 'niagaracollege.ca', createdAt: '2026-01-01T00:00:00Z' },
    ]));
    render(<AllowedDomains />);
    const row = screen.getByText('@niagaracollege.ca').closest('.data-row');
    expect(within(row).getByText('signs in without review')).toBeInTheDocument();
  });

  /**
   * An empty allowlist is not a neutral state — it means every single signup
   * waits for an administrator. Saying so is the difference between a queue
   * that is empty by design and one nobody realised they had opted into.
   */
  it('explains what an empty list costs', () => {
    render(<AllowedDomains />);
    expect(screen.getByText('Every signup needs approval')).toBeInTheDocument();
    expect(screen.getByText(/everyone who signs up waits for you/)).toBeInTheDocument();
  });

  it('shows a load failure rather than an empty allowlist', () => {
    mocks.useAllowedDomains.mockReturnValue(query(undefined, { error: new Error('nope') }));
    render(<AllowedDomains />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load the domain allowlist/);
  });
});

describe('adding one', () => {
  it('sends what was typed', async () => {
    render(<AllowedDomains />);
    await userEvent.type(screen.getByLabelText('Allow a domain'), 'niagaracollege.ca');
    await userEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(varsOf(mocks.add)).toEqual({ domain: 'niagaracollege.ca' });
  });

  it('will not submit an empty field', () => {
    render(<AllowedDomains />);
    expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled();
  });

  /**
   * Allowlisting hands an active account to everyone at that domain with no
   * further review. That consequence belongs on the screen, not in someone's
   * head.
   */
  it('states the consequence before it is clicked', () => {
    render(<AllowedDomains />);
    const hint = screen.getByLabelText('Allow a domain')
      .getAttribute('aria-describedby');
    expect(document.getElementById(hint))
      .toHaveTextContent(/active account immediately, without review/);
  });

  it('surfaces a rejected domain', () => {
    mocks.state.add = {
      isPending: false,
      error: new Error('"not a domain" is not a valid domain. Use the part after the @'),
    };
    render(<AllowedDomains />);
    expect(screen.getByRole('alert')).toHaveTextContent(/is not a valid domain/);
  });
});

describe('removing one', () => {
  beforeEach(() => {
    mocks.useAllowedDomains.mockReturnValue(query([
      { domain: 'niagaracollege.ca', createdAt: '2026-01-01T00:00:00Z' },
    ]));
  });

  it('does not remove on the first click', async () => {
    render(<AllowedDomains />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  /**
   * Removing is not retroactive, and that is easy to assume wrongly — somebody
   * removing a domain to revoke access would otherwise think they had.
   */
  it('says the change is not retroactive before confirming', async () => {
    render(<AllowedDomains />);
    expect(screen.queryByText(/only affects new signups/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(screen.getByText(/only affects new signups/)).toBeInTheDocument();
    expect(screen.getByText(/suspend them individually/)).toBeInTheDocument();
  });

  it('removes on the second click', async () => {
    render(<AllowedDomains />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    const confirm = screen.getAllByRole('button', { name: 'Remove' })[0];
    await userEvent.click(confirm);
    expect(varsOf(mocks.remove)).toEqual({ domain: 'niagaracollege.ca' });
  });

  it('can be backed out of', async () => {
    render(<AllowedDomains />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(screen.queryByText(/only affects new signups/)).not.toBeInTheDocument();
  });
});

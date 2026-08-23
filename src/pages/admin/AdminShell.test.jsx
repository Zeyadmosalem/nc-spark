import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  useUsers: vi.fn(), usePendingSignups: vi.fn(),
  usePlatformStats: vi.fn(), useRecentAudit: vi.fn(),
}));
vi.mock('../../hooks/useAdmin', () => mocks);

const { Dashboard } = await import('./AdminShell');

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });

const STATS = {
  courses: { total: 4, published: 3 },
  enrollments: { active: 12, pending: 0 },
  attempts: { total: 30, pendingReview: 2 },
};

const show = () => render(<MemoryRouter><Dashboard /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useUsers.mockReturnValue(query([]));
  mocks.usePendingSignups.mockReturnValue(query([]));
  mocks.usePlatformStats.mockReturnValue(query(STATS));
  mocks.useRecentAudit.mockReturnValue(query([]));
});

describe('the numbers', () => {
  it('counts users by role from the directory, not a second query', () => {
    mocks.useUsers.mockReturnValue(query([
      { id: '1', role: 'trainee', status: 'active' },
      { id: '2', role: 'trainee', status: 'active' },
      { id: '3', role: 'trainer', status: 'active' },
    ]));
    show();
    const trainees = screen.getByText('Trainees').closest('.stat-card');
    expect(trainees).toHaveTextContent('2');
    const trainers = screen.getByText('Trainers').closest('.stat-card');
    expect(trainers).toHaveTextContent('1');
  });

  it('reports published courses alongside the total', () => {
    show();
    expect(screen.getByText('Courses').closest('.stat-card'))
      .toHaveTextContent('3 published');
  });
});

describe('what is deliberately not shown', () => {
  /**
   * Nothing in the product awards XP yet (backlog B7). The prototype dashboard
   * led with XP, streaks, badges and a leaderboard; wired to real data every
   * one of them is a confident zero, which reads as "your trainees are idle"
   * rather than "this is not measured yet".
   */
  it('makes no claim about XP, streaks or badges', () => {
    mocks.useUsers.mockReturnValue(query([{ id: '1', role: 'trainee', status: 'active' }]));
    show();
    expect(screen.queryByText(/XP/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/badge/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/top perform/i)).not.toBeInTheDocument();
  });
});

describe('what needs an admin', () => {
  it('links straight to the queue when signups are waiting', () => {
    mocks.usePendingSignups.mockReturnValue(query([{ id: 'p1' }, { id: 'p2' }]));
    show();
    const link = screen.getByRole('link', { name: /2 signups to review/ });
    expect(link).toHaveAttribute('href', '/admin/users');
  });

  it('stays quiet when there is nothing to act on', () => {
    show();
    expect(screen.queryByText('Waiting on you')).not.toBeInTheDocument();
  });

  it('flags suspended accounts', () => {
    mocks.useUsers.mockReturnValue(query([
      { id: '1', role: 'trainee', status: 'suspended' },
    ]));
    show();
    expect(screen.getByText(/1 account is suspended/)).toBeInTheDocument();
  });
});

describe('the audit trail', () => {
  it('renders a role change as a sentence', () => {
    mocks.useRecentAudit.mockReturnValue(query([{
      id: 1, actorEmail: 'admin@x.io', action: 'profile.role_changed',
      entityType: 'profile', entityId: 'u9',
      before: { role: 'trainee' }, after: { role: 'trainer' },
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    }]));
    show();
    expect(screen.getByText(/admin@x\.io changed a role from trainee to trainer/))
      .toBeInTheDocument();
    expect(screen.getByText('1h ago')).toBeInTheDocument();
  });

  it('still renders an action it does not recognise', () => {
    mocks.useRecentAudit.mockReturnValue(query([{
      id: 2, actorEmail: 'admin@x.io', action: 'course.archived',
      entityType: 'course', entityId: 'c1', before: null, after: null,
      createdAt: new Date().toISOString(),
    }]));
    show();
    expect(screen.getByText(/course archived/)).toBeInTheDocument();
  });
});

describe('failures', () => {
  it('shows an error rather than a dashboard of zeros', () => {
    mocks.usePlatformStats.mockReturnValue(query(undefined, {
      error: new Error('permission denied'),
    }));
    show();
    expect(screen.getByRole('alert'))
      .toHaveTextContent(/Could not load the platform overview/);
  });

  // The audit trail is the least important panel on the page. Its failure must
  // not take the counts down with it.
  it('keeps the counts when only the audit trail fails', () => {
    mocks.useRecentAudit.mockReturnValue(query(undefined, {
      error: new Error('nope'),
    }));
    show();
    expect(screen.getByText('Courses')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load the audit trail/);
  });
});

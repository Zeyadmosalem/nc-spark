import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitForElementToBeRemoved } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import StatusPill from './StatusPill';
import Alert from './Alert';
import EmptyState from './EmptyState';
import StatCard from './StatCard';
import PageSkeleton, { Skeleton, SkeletonList, LoadingLabel } from './Skeleton';
import PasswordField from './PasswordField';
import ToastProvider from './ToastProvider';
import { useToast } from './toast-context';

describe('StatusPill', () => {
  /**
   * The vocabularies are the database enums. A status this does not know is a
   * status the schema does not have — but it still renders, because an
   * unexpected state is worth seeing rather than hiding.
   */
  it.each([
    ['active', 'Active', 'pill-positive'],
    ['pending', 'Pending', 'pill-warning'],
    ['suspended', 'Suspended', 'pill-danger'],
    ['published', 'Published', 'pill-positive'],
    ['draft', 'Draft', 'pill-warning'],
    ['failed', 'Not passed', 'pill-danger'],
    ['pending_review', 'Awaiting marking', 'pill-warning'],
    ['in_progress', 'In progress', 'pill-info'],
  ])('renders %s as "%s"', (status, label, className) => {
    render(<StatusPill status={status} />);
    const pill = screen.getByText(label);
    expect(pill).toHaveClass(className);
  });

  /**
   * "Draft" and "Pending" are both warnings and were two different ambers when
   * this lived inline in four files. Same tone means the same class, which
   * means the same colour.
   */
  it('gives the same tone to statuses that mean the same thing', () => {
    const { rerender } = render(<StatusPill status="draft" />);
    const draft = screen.getByText('Draft').className;
    rerender(<StatusPill status="pending" />);
    expect(screen.getByText('Pending').className).toBe(draft);
  });

  it('prettifies a status it does not know rather than rendering nothing', () => {
    render(<StatusPill status="awaiting_countersign" />);
    expect(screen.getByText('Awaiting countersign')).toHaveClass('pill-neutral');
  });

  it('renders nothing at all without a status', () => {
    const { container } = render(<StatusPill status={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('takes an override for both label and tone', () => {
    render(<StatusPill status="draft" label="Unpublished" tone="danger" />);
    expect(screen.getByText('Unpublished')).toHaveClass('pill-danger');
  });
});

describe('Alert', () => {
  /**
   * Two of the four inline copies were plain <p> tags with no role, so a
   * refusal was announced to a screen reader as nothing at all — the button
   * was pressed, the server said no, and the page was silent.
   */
  it('interrupts for an error', () => {
    render(<Alert error={new Error('Cannot suspend the last active admin')} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Cannot suspend the last active admin');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  // Interrupting someone mid-sentence to tell them something worked is rude.
  it('is polite for a success or an aside', () => {
    render(<Alert tone="success">Saved</Alert>);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveClass('alert-success');
  });

  it('takes children instead of an Error', () => {
    render(<Alert tone="warning">Rejecting is permanent</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Rejecting is permanent');
  });

  // Rendering an empty bordered box for a mutation that has not failed is
  // worse than rendering nothing.
  it('renders nothing when there is nothing to say', () => {
    const { container } = render(<Alert error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for an error with no message', () => {
    const { container } = render(<Alert error={new Error('')} />);
    expect(container).toBeEmptyDOMElement();
  });

  /**
   * A title alone is enough. QueryError puts "Could not load the catalog." in
   * the title and the server's message in the body — and an Error whose
   * message is empty must not silence the half that says what failed.
   */
  it('still renders when only a title is given', () => {
    render(<Alert title="Could not load the catalog." error={new Error('')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the catalog.');
  });

  it('hides its decorative icon from assistive technology', () => {
    render(<Alert error={new Error('nope')} />);
    expect(screen.getByRole('alert').querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});

describe('Skeleton', () => {
  /**
   * A shimmer conveys nothing to a screen reader, and the shapes are noise in
   * the accessibility tree. The live label is what carries the meaning, and it
   * says the same sentence the old plain-text loader did.
   */
  it('announces what is loading, and hides the shapes', () => {
    render(<PageSkeleton label="Loading your dashboard" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading your dashboard');
    expect(status).toHaveClass('sr-only');
  });

  it('marks the placeholder bars as decorative', () => {
    const { container } = render(<Skeleton width={80} />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws the number of rows it was asked for', () => {
    const { container } = render(<SkeletonList rows={3} />);
    expect(container.querySelectorAll('.skeleton-row')).toHaveLength(3);
  });

  it('can omit the stats block for a page that has none', () => {
    const { container } = render(<PageSkeleton label="Loading" stats={0} rows={2} />);
    expect(container.querySelector('.stat-grid')).toBeNull();
  });

  it('LoadingLabel is polite, not assertive', () => {
    render(<LoadingLabel>Loading</LoadingLabel>);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});

describe('EmptyState and StatCard', () => {
  it('renders a title, a body and an action', () => {
    render(
      <EmptyState icon="📚" title="No courses yet" action={<button type="button">Create</button>}>
        Create one to get started.
      </EmptyState>,
    );
    expect(screen.getByText('No courses yet')).toBeInTheDocument();
    expect(screen.getByText('Create one to get started.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it('hides the decorative icon', () => {
    const { container } = render(<EmptyState icon="📚" title="Nothing" />);
    expect(container.querySelector('.empty-state-icon')).toHaveAttribute('aria-hidden', 'true');
  });

  /**
   * A dash and a zero say very different things — "not measured yet" against
   * "measured, and it is nothing". StatCard must not coerce either.
   */
  it('renders an em dash as given rather than turning it into a zero', () => {
    render(<StatCard label="Average score" value="—" />);
    const card = screen.getByText('Average score').closest('.stat-card');
    expect(card).toHaveTextContent('—');
    expect(card).not.toHaveTextContent('0');
  });

  it('renders a real zero', () => {
    render(<StatCard label="Courses" value={0} />);
    expect(screen.getByText('Courses').closest('.stat-card')).toHaveTextContent('0');
  });
});

describe('ToastProvider', () => {
  function Trigger({ message, tone }) {
    const { notify } = useToast();
    return <button type="button" onClick={() => notify(message, tone)}>Do it</button>;
  }

  /*
   * Real timers with a short lifetime, not fake ones. The exit animation keeps
   * the node mounted past the timer, so advancing fake time proves nothing
   * about whether it ever actually leaves the DOM — which is the thing worth
   * asserting, since a toast that never unmounts is a memory leak that also
   * stacks up over a session.
   */
  it('shows a confirmation, then clears itself', async () => {
    render(
      <ToastProvider lifetime={40}>
        <Trigger message="Grace approved as trainer." />
      </ToastProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Do it' }));
    const toast = screen.getByText('Grace approved as trainer.');
    await waitForElementToBeRemoved(toast);
  });

  it('can be dismissed before it expires', async () => {
    render(<ToastProvider lifetime={10000}><Trigger message="Saved" /></ToastProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Do it' }));
    const toast = screen.getByText('Saved');
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    await waitForElementToBeRemoved(toast);
  });

  it('stacks more than one', async () => {
    render(<ToastProvider><Trigger message="One" /></ToastProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Do it' }));
    await userEvent.click(screen.getByRole('button', { name: 'Do it' }));
    expect(screen.getAllByText('One')).toHaveLength(2);
  });

  it('ignores an empty message rather than flashing a blank box', async () => {
    const { container } = render(<ToastProvider><Trigger message="" /></ToastProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Do it' }));
    expect(container.querySelectorAll('.toast')).toHaveLength(0);
  });

  /**
   * The container mounts on every page. Giving it role="status" as well as
   * aria-live handed every page a permanent status region, which swallowed the
   * one a loading screen puts up — caught by App.auth.test.jsx.
   */
  it('is a live region without claiming to be the page status', () => {
    const { container } = render(<ToastProvider><span /></ToastProvider>);
    const stack = container.querySelector('.toast-stack');
    expect(stack).toHaveAttribute('aria-live', 'polite');
    expect(stack).not.toHaveAttribute('role');
  });

  // A page rendered outside the provider must not crash for want of a
  // confirmation message. Every page test in the suite relies on this.
  it('is a no-op with no provider above it', async () => {
    render(<Trigger message="nowhere to go" />);
    await userEvent.click(screen.getByRole('button', { name: 'Do it' }));
    expect(screen.queryByText('nowhere to go')).not.toBeInTheDocument();
  });
});

describe('PasswordField', () => {
  function Harness(props) {
    const [value, setValue] = useState('');
    return <PasswordField value={value} onChange={setValue} {...props} />;
  }

  /**
   * Every password field in the app was write-only. That is how somebody
   * mistypes a password three times and concludes the account is broken — and
   * it matters most on signup, where there is no confirm field and the typo is
   * only discovered at the next sign-in.
   */
  it('reveals and re-hides what was typed', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');

    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  /**
   * The eye reports state, not the action: shut while the password is hidden,
   * open once it is on screen. The accessible name says the opposite thing on
   * purpose — a button's name has to describe what pressing it does — so this
   * asserts the glyph rather than the label, which the tests above cover.
   */
  it('shows a shut eye by default and an open one once revealed', async () => {
    render(<Harness />);
    const eye = () => screen.getByRole('button', { name: /password/i })
      .querySelector('svg')?.getAttribute('class') ?? '';

    expect(eye()).toMatch(/eye-off/);
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(eye()).toMatch(/eye/);
    expect(eye()).not.toMatch(/eye-off/);
  });

  it('reports its state to assistive technology', async () => {
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide password' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  /**
   * The toggle's accessible name deliberately is not just "Password", so a
   * query for the input does not also match the button.
   */
  it('does not collide with a query for the field itself', () => {
    render(<Harness />);
    expect(screen.getByLabelText(/^password$/i).tagName).toBe('INPUT');
  });

  // Stating the rule up front beats stating it after the form is rejected.
  it('ties its hint to the input for a screen reader', () => {
    render(<Harness hint="At least 8 characters." minLength={8} />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('minLength', '8');
    const hintId = input.getAttribute('aria-describedby');
    expect(document.getElementById(hintId)).toHaveTextContent('At least 8 characters.');
  });
});

import { signOut } from '../../api/auth';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import AuthLayout from './AuthLayout';

/**
 * The screen an account that exists but cannot be used lands on.
 *
 * It is reached by someone who has just done everything right — created an
 * account, confirmed an email — and been stopped anyway, so it says who is
 * holding it and what happens next rather than only that it is held.
 */
export default function PendingApprovalPage({ status = 'pending' }) {
  const suspended = status === 'suspended';

  const copy = suspended
    ? {
        icon: 'blocked',
        tone: 'danger',
        title: 'Account suspended',
        body: 'Your access has been suspended, so nothing in NC Spark will open.',
        next: 'An administrator can reinstate it. Contact them if you believe this is a mistake — your progress is not deleted while an account is suspended.',
      }
    : {
        icon: 'waiting',
        tone: 'warning',
        title: 'Awaiting approval',
        body: 'Your account exists and is waiting for an administrator to admit you.',
        next: 'Nothing more is needed from you. You will be able to sign in as soon as somebody approves it, and everything will be here when you do.',
      };

  return (
    <AuthLayout title={copy.title} subtitle={copy.body}>
      <div className={`auth-status auth-status-${copy.tone}`}>
        <span className="auth-status-icon">
          <Icon name={copy.icon} size={20} />
        </span>
        <p>{copy.next}</p>
      </div>

      {/*
        Signing out is the only action available, and it has to be here:
        without it an account in this state cannot reach the login form to
        try a different one.
      */}
      <Button variant="secondary" block icon="logout" onClick={() => signOut()}>
        Sign out
      </Button>
    </AuthLayout>
  );
}

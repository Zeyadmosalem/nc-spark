import { signOut } from '../../api/auth';

export default function PendingApprovalPage({ status = 'pending' }) {
  const copy = status === 'suspended'
    ? {
        icon: '🚫',
        title: 'Account suspended',
        body: 'Your access has been suspended. Contact your administrator if you believe this is a mistake.',
      }
    : {
        icon: '⏳',
        title: 'Awaiting approval',
        body: 'Your account has been created and is waiting for an administrator to approve it. You will be able to sign in once approved.',
      };

  return (
    <div className="login-page">
      <div className="login-container" style={{ maxWidth: 460 }}>
        <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ fontSize: '3rem' }} aria-hidden="true">{copy.icon}</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', margin: '1rem 0 0.5rem' }}>{copy.title}</h2>
          <p style={{ color: 'var(--text-2)', maxWidth: '44ch', margin: '0 auto 1.5rem' }}>{copy.body}</p>
          <button className="btn btn-ghost" onClick={() => signOut()}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

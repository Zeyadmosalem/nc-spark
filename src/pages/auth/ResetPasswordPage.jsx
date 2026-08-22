import { useState } from 'react';
import { Link } from 'react-router-dom';
import { resetPassword } from '../../api/auth';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container" style={{ maxWidth: 420 }}>
        <div className="login-header"><h1>Reset your password</h1></div>
        <form onSubmit={handleSubmit} className="card no-hover"
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
          {error && <div role="alert" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem' }}>{error}</div>}
          {sent
            ? (
              // Deliberately does not reveal whether the address exists.
              <p style={{ color: 'var(--text-2)' }}>If that address has an account, a reset link is on its way.</p>
            )
            : (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Email</span>
                  <input type="email" value={email} required autoComplete="email"
                         onChange={(e) => setEmail(e.target.value)}
                         style={{
                           padding: '0.7rem 0.9rem', borderRadius: 'var(--r-md)',
                           border: '1.5px solid var(--border)', background: 'var(--surface-alt)',
                           color: 'var(--text)', fontFamily: 'var(--font-body)',
                         }} />
                </label>
                <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                  {busy ? 'Sending…' : 'Send reset link'}
                </button>
              </>
            )}
          <div style={{ fontSize: '0.8rem', textAlign: 'center' }}><Link to="/login">Back to sign in</Link></div>
        </form>
      </div>
    </div>
  );
}

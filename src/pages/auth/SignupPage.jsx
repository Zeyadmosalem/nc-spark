import { useState } from 'react';
import { Link } from 'react-router-dom';
import { signUp } from '../../api/auth';

const field = {
  padding: '0.7rem 0.9rem', borderRadius: 'var(--r-md)',
  border: '1.5px solid var(--border)', background: 'var(--surface-alt)',
  color: 'var(--text)', fontFamily: 'var(--font-body)',
};

export default function SignupPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUp(form);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="login-page">
        <div className="login-container" style={{ maxWidth: 420 }}>
          <div className="card no-hover" style={{ textAlign: 'center', padding: '2.5rem' }}>
            <div style={{ fontSize: '3rem' }}>📧</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', margin: '1rem 0 0.5rem' }}>Check your inbox</h2>
            <p style={{ color: 'var(--text-2)' }}>
              Confirm your email address to finish creating your account.
            </p>
            <Link to="/login" className="btn btn-ghost" style={{ marginTop: '1.5rem' }}>Back to sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container" style={{ maxWidth: 420 }}>
        <div className="login-header">
          <h1>Create your account</h1>
          <p>Accounts outside an approved domain need administrator approval.</p>
        </div>
        <form onSubmit={handleSubmit} className="card no-hover"
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
          {error && <div role="alert" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem' }}>{error}</div>}

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Full name</span>
            <input type="text" value={form.name} required onChange={set('name')} style={field} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Email</span>
            <input type="email" value={form.email} required autoComplete="email" onChange={set('email')} style={field} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Password</span>
            <input type="password" value={form.password} required autoComplete="new-password" onChange={set('password')} style={field} />
          </label>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <div style={{ fontSize: '0.8rem', textAlign: 'center' }}>
            <Link to="/login">Already have an account?</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

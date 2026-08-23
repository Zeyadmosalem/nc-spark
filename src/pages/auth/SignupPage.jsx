import { useState } from 'react';
import { Link } from 'react-router-dom';
import { signUp } from '../../api/auth';
import Alert from '../../components/ui/Alert';
import PasswordField from '../../components/ui/PasswordField';

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
          <Alert tone="error">{error}</Alert>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span className="input-label" style={{ margin: 0 }}>Full name</span>
            <input type="text" className="input-field" value={form.name} required
                   autoComplete="name" onChange={set('name')} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span className="input-label" style={{ margin: 0 }}>Email</span>
            <input type="email" className="input-field" value={form.email} required
                   autoComplete="email" onChange={set('email')} />
          </label>

          {/* The rule is stated up front rather than only after it is broken.
              There is no confirm field, so a typo here is only discovered at
              the next sign-in — which is why this one can be revealed. */}
          <PasswordField
            value={form.password}
            autoComplete="new-password"
            minLength={8}
            hint="At least 8 characters."
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          />

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

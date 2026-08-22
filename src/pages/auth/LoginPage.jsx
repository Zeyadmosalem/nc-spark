import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signIn } from '../../api/auth';

const field = {
  padding: '0.7rem 0.9rem', borderRadius: 'var(--r-md)',
  border: '1.5px solid var(--border)', background: 'var(--surface-alt)',
  color: 'var(--text)', fontFamily: 'var(--font-body)',
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container" style={{ maxWidth: 420 }}>
        <div className="login-header">
          <div className="login-logo">
            <div className="login-logo-mark">NC</div>
            <strong> Spark </strong>
          </div>
          <h1>Welcome back</h1>
          <p>Sign in to continue your training.</p>
        </div>

        <form onSubmit={handleSubmit} className="card no-hover"
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
          {error && (
            <div role="alert" style={{ color: 'var(--brand-accent)', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Email</span>
            <input type="email" value={email} autoComplete="email" required
                   onChange={(e) => setEmail(e.target.value)} style={field} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Password</span>
            <input type="password" value={password} autoComplete="current-password" required
                   onChange={(e) => setPassword(e.target.value)} style={field} />
          </label>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
            <Link to="/reset-password">Forgot password?</Link>
            <Link to="/signup">Create an account</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

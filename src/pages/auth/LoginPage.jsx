import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signIn } from '../../api/auth';
import Alert from '../../components/ui/Alert';
import PasswordField from '../../components/ui/PasswordField';

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

        <form
          onSubmit={handleSubmit}
          className="card no-hover"
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}
        >
          {/* Alert rather than a bare coloured <p>: it carries the assertive
              live region, so a failed sign-in is actually announced. */}
          <Alert tone="error">{error}</Alert>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <span className="input-label" style={{ margin: 0 }}>Email</span>
            <input
              type="email"
              className="input-field"
              value={email}
              autoComplete="email"
              autoFocus
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <PasswordField
            label="Password"
            value={password}
            autoComplete="current-password"
            onChange={setPassword}
          />

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontSize: '0.8rem' }}>
            <Link to="/reset-password">Forgot password?</Link>
            <Link to="/signup">Create an account</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

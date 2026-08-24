import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signIn } from '../../api/auth';
import Alert from '../../components/ui/Alert';
import PasswordField from '../../components/ui/PasswordField';
import Button from '../../components/ui/Button';
import AuthLayout from './AuthLayout';

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
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue your training."
      footer={(
        <>
          <Link to="/reset-password">Forgot your password?</Link>
          <Link to="/signup">Create an account</Link>
        </>
      )}
    >
      <form onSubmit={handleSubmit} className="auth-form">
        {/* Alert rather than a bare coloured <p>: it carries the assertive
            live region, so a failed sign-in is actually announced. */}
        <Alert tone="error">{error}</Alert>

        <div className="field">
          <label className="input-label" htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            className="input-field"
            value={email}
            autoComplete="email"
            autoFocus
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <PasswordField
          label="Password"
          value={password}
          autoComplete="current-password"
          onChange={setPassword}
        />

        {/*
          The label does not change to "Signing in…". Swapping it resizes the
          button mid-click; the spinner takes the icon's place instead, and
          Button disables itself while pending so a double click cannot send
          two sign-in requests.
        */}
        <Button type="submit" variant="primary" size="lg" block pending={busy}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

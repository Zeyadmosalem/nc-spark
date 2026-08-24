import { useState } from 'react';
import { Link } from 'react-router-dom';
import { resetPassword } from '../../api/auth';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import AuthLayout from './AuthLayout';

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

  if (sent) {
    return (
      <AuthLayout
        title="Check your inbox"
        // Deliberately does not reveal whether the address exists: "no
        // account with that email" is a way to enumerate who has one.
        subtitle="If that address has an account, a reset link is on its way."
      >
        <div className="auth-confirm">
          <span className="auth-confirm-icon">
            <Icon name="email" size={24} />
          </span>
          <p className="input-hint">
            The link expires after an hour. Nothing changes about your current
            password until you use it.
          </p>
        </div>
        <Button to="/login" variant="secondary" block icon="back">Back to sign in</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a link to set a new one."
      footer={<Link to="/login">Back to sign in</Link>}
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <Alert tone="error">{error}</Alert>

        <div className="field">
          <label className="input-label" htmlFor="reset-email">Email</label>
          <input
            id="reset-email"
            type="email"
            className="input-field"
            value={email}
            required
            autoFocus
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <Button type="submit" variant="primary" size="lg" block pending={busy}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}

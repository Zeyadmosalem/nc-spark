import { useState } from 'react';
import { Link } from 'react-router-dom';
import { signUp } from '../../api/auth';
import Alert from '../../components/ui/Alert';
import PasswordField from '../../components/ui/PasswordField';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import AuthLayout from './AuthLayout';

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
      <AuthLayout
        title="Check your inbox"
        subtitle={`Confirm the address at ${form.email || 'your email'} to finish creating your account.`}
      >
        <div className="auth-confirm">
          <span className="auth-confirm-icon">
            <Icon name="email" size={24} />
          </span>
          {/*
            Said here rather than left for the sign-in attempt to reveal.
            Somebody who confirms their email and is then told to wait, with
            no warning that a wait was coming, reads it as a failure.
          */}
          <p className="input-hint">
            If your address is not on an approved domain, an administrator has
            to admit you as well — you will see that when you sign in.
          </p>
        </div>
        <Button to="/login" variant="secondary" block icon="back">Back to sign in</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Accounts outside an approved domain need administrator approval."
      footer={<Link to="/login">Already have an account?</Link>}
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <Alert tone="error">{error}</Alert>

        <div className="field">
          <label className="input-label" htmlFor="signup-name">Full name</label>
          <input
            id="signup-name" type="text" className="input-field" value={form.name}
            required autoComplete="name" autoFocus onChange={set('name')}
          />
        </div>

        <div className="field">
          <label className="input-label" htmlFor="signup-email">Email</label>
          <input
            id="signup-email" type="email" className="input-field" value={form.email}
            required autoComplete="email" onChange={set('email')}
          />
        </div>

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

        <Button type="submit" variant="primary" size="lg" block pending={busy}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

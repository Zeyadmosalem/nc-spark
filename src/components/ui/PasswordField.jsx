import { useId, useState } from 'react';

/**
 * A password input you can look at.
 *
 * Every password field in the app was write-only, which is how people mistype
 * a password three times and conclude the account is broken. It matters most
 * on signup, where there is no second field to catch a typo and the mistake
 * is only discovered at the next sign-in.
 *
 * The toggle is a real button, so it is reachable by keyboard and announces
 * its state. Its accessible name deliberately avoids being just "Password",
 * so a query for the field itself does not also match the button.
 */
export default function PasswordField({
  label = 'Password',
  value,
  onChange,
  autoComplete = 'current-password',
  minLength,
  hint,
  required = true,
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <label className="input-label" style={{ margin: 0 }} htmlFor={id}>{label}</label>
      <div style={{ position: 'relative', display: 'flex' }}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="input-field"
          value={value}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, paddingRight: '4.25rem' }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          style={{
            position: 'absolute',
            right: '0.5rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 0,
            color: 'var(--text-3)',
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontWeight: 600,
            padding: '0.25rem 0.4rem',
          }}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && (
        <p id={hintId} style={{ fontSize: '0.78rem', color: 'var(--text-3)', margin: 0 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

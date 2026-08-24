import { useId, useState } from 'react';
import { motion } from 'framer-motion';
import Icon from './Icon';
import { EASE_OUT } from '../../lib/motion';

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
    <div className="field">
      <label className="input-label" htmlFor={id}>{label}</label>
      <div className="password-wrap">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="input-field password-input"
          value={value}
          autoComplete={autoComplete}
          minLength={minLength}
          required={required}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((v) => !v)}
          /*
           * The icon and the label deliberately say different things. The eye
           * reports STATE — shut while the password is hidden, open once it is
           * on screen — because that is what the glyph is for. The accessible
           * name reports the ACTION, because that is what a button's name is
           * for: a screen reader user needs to know what pressing it does, not
           * what it currently looks like.
           */
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          title={visible ? 'Hide password' : 'Show password'}
        >
          {/*
            Keyed so the glyph re-runs its entrance on each toggle, but
            deliberately NOT wrapped in AnimatePresence. `mode="wait"` keeps the
            outgoing eye mounted for the length of its exit, which left the icon
            reporting the old state for about 150ms after the password had
            already changed — on the one control whose entire job is to confirm,
            immediately, what is on screen.
          */}
          <motion.span
            key={visible ? 'open' : 'shut'}
            initial={{ opacity: 0.4, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.14, ease: EASE_OUT }}
            style={{ display: 'grid', placeItems: 'center' }}
          >
            <Icon name={visible ? 'show' : 'hide'} size={16} />
          </motion.span>
        </button>
      </div>
      {hint && <p id={hintId} className="input-hint">{hint}</p>}
    </div>
  );
}

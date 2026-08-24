import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

/**
 * One button.
 *
 * There were three shapes of button in the app doing the same job: a `<button
 * className="btn btn-primary">`, a `<Link className="btn btn-primary">` with
 * four inline styles pasted on to undo the anchor's underline and colour, and
 * a `<button>` with its own inline padding. The Link version had to restate
 * `textDecoration: 'none', display: 'flex', justifyContent: 'center'` at every
 * call site, and about half of them forgot one.
 *
 * Three behaviours that were previously left to each caller:
 *
 * - A pending button keeps its label and swaps its icon for a spinner. The old
 *   pattern replaced the whole label with "Saving…", which changes the
 *   button's width mid-click and moves whatever is next to it.
 * - A pending button is disabled. Every call site remembered the label and
 *   most forgot the guard, so a double click sent two requests.
 * - An icon-only button requires a label, because there is no text for a
 *   screen reader to fall back on.
 */

const Button = forwardRef(function Button({
  variant = 'secondary',
  size,
  icon,
  iconAfter,
  pending = false,
  block = false,
  to,
  href,
  children,
  className = '',
  disabled,
  'aria-label': ariaLabel,
  ...rest
}, ref) {
  const iconOnly = !children;

  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'sm' && 'btn-sm',
    size === 'lg' && 'btn-lg',
    block && 'btn-block',
    iconOnly && 'btn-icon',
    className,
  ].filter(Boolean).join(' ');

  const inner = (
    <>
      {/*
        The spinner takes the leading icon's place rather than being appended,
        so the button does not grow by 20px the moment it is pressed.
      */}
      {pending
        ? <span className="btn-spinner" aria-hidden="true" />
        : icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
      {iconAfter && !pending && <Icon name={iconAfter} size={size === 'sm' ? 14 : 16} />}
    </>
  );

  // A link that looks like a button is still a link: it must keep
  // middle-click, "open in new tab" and the browser's own focus handling,
  // which a button with an onClick that calls navigate() throws away.
  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} aria-label={ariaLabel} {...rest}>
        {inner}
      </Link>
    );
  }

  if (href) {
    return (
      <a
        ref={ref}
        href={href}
        className={classes}
        aria-label={ariaLabel}
        // Any href here is external by construction — internal navigation
        // uses `to`. rel is not optional on a target=_blank link.
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      className={classes}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      aria-label={ariaLabel}
      {...rest}
    >
      {inner}
    </button>
  );
});

export default Button;

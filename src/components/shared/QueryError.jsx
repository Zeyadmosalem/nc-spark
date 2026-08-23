import Alert from '../ui/Alert';

/**
 * The visible half of a failed query.
 *
 * Without this a rejected fetch renders as an empty list, which reads as "you
 * have nothing" rather than "we could not load this" — the difference between
 * a trainee thinking there are no courses and knowing the page is broken.
 *
 * Built on Alert so a load failure and an action failure look and sound the
 * same. It used to be a hand-rolled card with a left border, which was the
 * fifth copy of that pattern.
 */
export default function QueryError({ error, what }) {
  if (!error) return null;
  return (
    <Alert tone="error" title={`Could not load ${what}.`}>
      {error.message}
    </Alert>
  );
}

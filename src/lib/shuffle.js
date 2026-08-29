/**
 * Orders the definitions so they do not line up with their terms.
 *
 * This used to be `[...pairs].reverse()`, with a comment calling it a way to
 * "mix them up a little bit for the demo". Reversing is not mixing: it maps
 * term i to definition n-1-i, so the activity was solvable from position
 * alone, without reading a word of it.
 *
 * Seeded from the pair text rather than Math.random, for two reasons: a
 * component must be pure, so the order cannot change between renders of the
 * same activity; and a trainee who leaves and comes back should meet the same
 * board rather than a reshuffled one.
 */
export function shuffleDefinitions(pairs) {
  const list = [...(pairs ?? [])];

  let seed = list.reduce(
    (acc, p) => [...String(p.term ?? '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, acc),
    list.length * 2654435761,
  ) >>> 0;

  const next = () => {
    // xorshift32: small, deterministic, and good enough to break the ordering.
    seed ^= seed << 13; seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;  seed >>>= 0;
    return seed / 4294967296;
  };

  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

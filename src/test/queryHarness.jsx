import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * A React Query wrapper for testing one hook.
 *
 * Every hook test in this codebase had built its own; the shape is identical
 * in all of them, and the two options that matter are easy to leave out by
 * accident. `retry: false` makes a rejected query fail in one tick instead of
 * three, and a client per render stops one test's cache from answering the
 * next one's query.
 */
export function withQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  return { client, Wrapper };
}

/** renderHook with the wrapper already applied. */
export function renderQuery(hook) {
  const { client, Wrapper } = withQueryClient();
  return { ...renderHook(hook, { wrapper: Wrapper }), client };
}

/** Waits for a query to settle either way, so a failure reads as a failure. */
export async function settled(result) {
  await waitFor(() => expectSettled(result));
  return result.current;
}

function expectSettled(result) {
  if (result.current.isLoading || result.current.isPending) {
    throw new Error('still pending');
  }
}

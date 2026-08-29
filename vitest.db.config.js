import { defineConfig } from 'vitest/config';
import { BaseSequencer } from 'vitest/node';

/**
 * Runs the files in a fixed order.
 *
 * Vitest's default sequencer sorts slowest-first, using durations cached from
 * the previous run — so the order changes from run to run as timings drift.
 * That is the right default when files run in parallel and the wrong one here,
 * where fileParallelism is false and the benefit is nil: all it buys is that
 * every run exercises a different ordering against one shared database, which
 * is how "a different single test fails each time, and passes on its own"
 * happens.
 *
 * Alphabetical is arbitrary; being the SAME arbitrary order every time is the
 * point, because it makes a failure reproducible.
 */
class FixedOrder extends BaseSequencer {
  async sort(files) {
    return [...files].sort((a, b) => String(a.moduleId).localeCompare(String(b.moduleId)));
  }
}

// Database tests hit a real hosted Supabase project, so they run serially
// with longer timeouts and stay out of the fast frontend suite.
export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.js'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    sequence: { sequencer: FixedOrder },
  },
});

import { defineConfig } from 'vitest/config';

// Database tests hit a real hosted Supabase project, so they run serially
// with longer timeouts and stay out of the fast frontend suite.
export default defineConfig({
  test: {
    include: ['supabase/tests/**/*.test.js'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});

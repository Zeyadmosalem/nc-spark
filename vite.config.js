import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Two projects because there are two runtimes. The app is jsdom and needs
    // the Testing Library setup; worker/ is the Cloudflare access gate, which
    // runs on the edge and must not load a DOM teardown that calls
    // localStorage. Before this, worker/ was outside the include glob
    // altogether — the file that can lock every user out had never been run.
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'app',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup.js'],
          // Vite loads .env.local in test mode too, so on a developer machine
          // these tests ran against the real project: the chat screens opened
          // a live Realtime socket, while CI — which has no .env.local — took
          // the null-client path and skipped the subscription entirely. Same
          // green tick, different code. Blanking the two VITE_ variables here
          // makes every machine take CI's path, which is the one the comment
          // in src/test/setup.js already claimed. The subscription itself is
          // covered by src/hooks/useMessages.test.jsx, which stubs the
          // channel and asserts it is opened for the right course and closed
          // again.
          env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
          include: ['src/**/*.{test,spec}.{js,jsx}'],
          // Must exceed the asyncUtilTimeout set in src/test/setup.js. At the
          // default 5000 they are equal, so a failing waitFor never gets to
          // report its own assertion — the test times out first and says only
          // "Test timed out in 5000ms", which hides what actually went wrong.
          testTimeout: 15000,
        },
      },
      {
        test: {
          name: 'worker',
          environment: 'node',
          globals: true,
          include: ['worker/**/*.test.js'],
        },
      },
    ],
  },
})

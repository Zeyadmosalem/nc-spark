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

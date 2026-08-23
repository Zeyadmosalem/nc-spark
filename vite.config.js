import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    // Must exceed the asyncUtilTimeout set in src/test/setup.js. At the
    // default 5000 they are equal, so a failing waitFor never gets to report
    // its own assertion — the test times out first and says only "Test timed
    // out in 5000ms", which hides what actually went wrong.
    testTimeout: 15000,
  },
})

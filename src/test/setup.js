import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// No Supabase mock is needed: src/api/client.js sees no VITE_ credentials
// under test and exports a null client, which is the dummy-data path.
afterEach(() => {
  cleanup();
  localStorage.clear();
});

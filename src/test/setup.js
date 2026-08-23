import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// The four role shells are code-split, so any assertion that crosses one waits
// on a dynamic import as well as a render. Testing Library's 1000ms default
// was tuned for eager imports: it passes in isolation and fails under
// full-suite CPU contention, which is the worst kind of flake. 5s is generous
// for a real resolution and still fails fast on a genuine hang.
configure({ asyncUtilTimeout: 5000 });

// No Supabase mock is needed: src/api/client.js sees no VITE_ credentials
// under test and exports a null client, which is the dummy-data path.
afterEach(() => {
  cleanup();
  localStorage.clear();
});

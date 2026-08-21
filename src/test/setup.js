import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// The app reads Supabase credentials at import time and falls back to dummy
// data when they are absent. Tests run in that dummy-data mode deliberately.
vi.mock('../lib/supabaseClient', () => ({ supabase: null }));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

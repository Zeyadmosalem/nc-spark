import { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeContext } from './theme-context';

const STORAGE_KEY = 'nc_theme';

/**
 * Light or dark, remembered.
 *
 * Lifted out of AppContext, which was the prototype's do-everything store and
 * carried dummyData with it. The storage key is unchanged, so anyone who has
 * already picked a theme keeps it.
 *
 * First visit now follows the operating system instead of defaulting to light.
 * Someone who runs their machine dark has said what they want before they ever
 * open this app; ignoring that and flashing a white page at them is a choice,
 * and it was the wrong one.
 */
function initialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Private mode, or storage disabled. Fall through to the OS preference.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not being able to remember the choice is not a reason to break it.
    }
  }, [theme]);

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    [],
  );

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

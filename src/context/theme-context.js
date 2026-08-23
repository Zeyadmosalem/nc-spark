import { createContext, useContext } from 'react';

/**
 * Split from the provider so each file exports only components or only
 * functions, which is what react-refresh wants — and what two of the five
 * remaining lint warnings were about in AppContext.
 *
 * The default is a working no-op so a component rendered outside the provider,
 * including in a test, does not crash for want of a theme toggle.
 */
export const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {} });

export const useTheme = () => useContext(ThemeContext);

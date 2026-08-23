import { createContext, useContext } from 'react';

/**
 * Context and hook live apart from the provider component so the file exports
 * only components or only functions — which is what react-refresh wants, and
 * what four of the five existing lint warnings are about.
 *
 * The default is a working no-op rather than undefined. A page rendered on its
 * own in a test, or mounted outside the provider by mistake, must not crash
 * for want of a confirmation message.
 */
export const ToastContext = createContext({ notify: () => {} });

export const useToast = () => useContext(ToastContext);

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ToastContext } from './toast-context';

/**
 * Confirmation for actions whose result happens off-screen.
 *
 * Approving a signup removes a row from a queue. Publishing a course changes a
 * pill two lines down. Both look exactly like a click that did nothing, and
 * the only feedback the app had was the absence of an error.
 *
 * Errors are NOT routed here. A refusal belongs next to the control that was
 * refused, where the person is already looking, and it must persist rather
 * than time out — see Alert.
 */

const LIFETIME_MS = 4000;

/**
 * @param lifetime  how long a toast stays, in ms. A prop rather than a
 *                  constant so a test can use a short one: the exit animation
 *                  keeps the node mounted after the timer fires, which makes
 *                  fake timers unable to observe the removal at all.
 */
export default function ToastProvider({ children, lifetime = LIFETIME_MS }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback((message, tone = 'success') => {
    if (!message) return;
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current, { id, message, tone }]);
    timers.current.set(id, setTimeout(() => dismiss(id), lifetime));
  }, [dismiss, lifetime]);

  // A timer that fires after unmount sets state on a dead component.
  const timersRef = timers;
  useEffect(() => () => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
  }, [timersRef]);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/*
        aria-live on the container, not on the toast: the region has to exist
        in the DOM before the message is inserted, or a screen reader has
        nothing to watch and announces nothing.

        aria-live WITHOUT role="status" on purpose. role="status" implies
        aria-live="polite", so it adds nothing — and because this container is
        mounted on every page, it made every page own a permanent status
        region, which swallows the one a loading screen puts up.
      */}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
              className={`toast toast-${toast.tone}`}
            >
              <span className="toast-icon" aria-hidden="true">
                {toast.tone === 'error' ? '⚠️' : '✓'}
              </span>
              <div className="toast-body">{toast.message}</div>
              <button
                type="button"
                className="toast-close"
                aria-label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

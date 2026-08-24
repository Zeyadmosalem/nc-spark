import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Sidebar from './Sidebar';
import { pageTransition } from '../../lib/motion';

/**
 * The frame every role portal sits in.
 *
 * Four shells had copied the same three lines, and all four were missing the
 * same three things:
 *
 * - No `<main>` landmark anywhere in the app. The content area was a plain
 *   div, so a screen reader's "jump to main content" did nothing.
 * - No skip link. Every navigation meant tabbing through the whole sidebar
 *   again before reaching anything on the page.
 * - No page title. `document.title` said "NC Spark" on all thirty screens, so
 *   browser tabs, history and window switchers were indistinguishable.
 *
 * On a route change it also moves focus to the main region. Without that a
 * screen reader is left reading the old page while a new one renders, and the
 * next Tab resumes wherever the sidebar left off rather than at the content.
 */
export default function RoleShell({ navItems, footerExtra, title, children }) {
  const location = useLocation();
  const { pathname } = location;
  const main = useRef(null);
  const firstRender = useRef(true);

  // The nav entry whose path this is, longest match first so
  // /trainer/courses/:id resolves to "My Courses" rather than the dashboard.
  const current = [...navItems]
    .filter((item) => item.to)
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));

  useEffect(() => {
    document.title = current?.label ? `${current.label} · ${title}` : title;
  }, [current?.label, title]);

  useEffect(() => {
    // Not on first paint: stealing focus the moment a page loads is its own
    // problem, and the browser has already put focus somewhere sensible.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    main.current?.focus();
    // A route change should start at the top. Without this, navigating from
    // halfway down a long roster lands on the next page mid-scroll.
    main.current?.scrollTo?.({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Sidebar navItems={navItems} footerExtra={footerExtra} />
      {/*
        tabIndex -1 makes this focusable by script without adding it to the tab
        order. outline:none is safe here specifically because the focus is
        programmatic and the region is the whole page — there is nothing for a
        ring to usefully outline.
      */}
      <main
        id="main-content"
        className="main-content"
        ref={main}
        tabIndex={-1}
        style={{ outline: 'none' }}
      >
        {/*
          mode="wait" so the outgoing page is gone before the incoming one
          arrives. Overlapping them would mean two copies of the same headings
          in the accessibility tree while they cross-fade, and a layout that
          jumps as one unmounts.

          Keyed on pathname, so a route change animates and a state change
          within one page does not.
        */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={pageTransition.initial}
            animate={pageTransition.animate}
            exit={pageTransition.exit}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

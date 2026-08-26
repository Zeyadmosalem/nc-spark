import { Routes, Route, Navigate } from 'react-router-dom';
import RoleShell from '../../components/shared/RoleShell';
import TrainerDashboard from './TrainerDashboard';
import TrainerReview from './TrainerReview';
import TrainerCourses from './TrainerCourses';
import CourseBuilder from '../../components/authoring/CourseBuilder';
import CourseRoster from '../../components/roster/CourseRoster';
import SupportInbox from '../../components/support/SupportInbox';
import { useSupportUnread } from '../../hooks/useSupport';
import AccountPage from '../shared/AccountPage';
import { usePendingReviews, useBlockedAttempts } from '../../hooks/useReview';

const NAV = [
  { to: '/trainer', end: true, icon: 'dashboard', label: 'Dashboard' },
  { to: '/trainer/courses', icon: 'courses', label: 'My Courses' },
  { to: '/trainer/review', icon: 'review', label: 'Review Work' },
  { to: '/trainer/support', icon: 'support', label: 'Contact admin' },
  { section: 'Account' },
  { to: '/trainer/account', icon: 'account', label: 'My Account' },
];

export default function TrainerShell() {
  // Both queues are blocking for a trainee, so the count belongs where a
  // trainer looks first. Without it they only discover work by visiting the
  // page, and a trainee waits until they happen to.
  const pending = usePendingReviews();
  const blocked = useBlockedAttempts();
  const waiting = (pending.data?.length ?? 0) + (blocked.data?.length ?? 0);

  // Counts threads with something the reader has not seen, rather than ones
  // "awaiting staff" — a reply you have already read is not a notification.
  const asking = useSupportUnread();

  const nav = NAV.map((item) => {
    if (item.to === '/trainer/review') return { ...item, badge: waiting };
    if (item.to === '/trainer/support') return { ...item, badge: asking };
    return item;
  });

  return (
    <RoleShell navItems={nav} title="NC Spark Teaching">
      <Routes>
        <Route index element={<TrainerDashboard />} />
        <Route path="courses" element={<TrainerCourses />} />
        {/* The same builder the admin console mounts. modules_write and
        activities_write authorise the owning trainer identically, so a
        second implementation would only be a second thing to keep in
        step. */}
        <Route path="courses/:courseId" element={<CourseBuilder backTo="/trainer/courses" />} />
        {/* Who is on the course, as opposed to what is in it. */}
        <Route path="courses/:courseId/people" element={<CourseRoster backTo="/trainer/courses" />} />
        {/* The prototype's Create Content forms wrote to in-memory context.
        Authoring now happens inside a course, which is the only place it
        can: an activity needs a module to live in. */}
        <Route path="create/*" element={<Navigate to="/trainer/courses" replace />} />
        <Route path="review" element={<TrainerReview />} />
        {/* Support is the platform-wide channel to administrators. Course
            questions belong in the course chat. */}
        <Route path="support" element={(
          <SupportInbox
            canCreate
            eyebrow="Support"
            title="Contact an administrator"
            subtitle="Ask the administrator team about a platform issue."
            emptyTitle="Nothing to answer"
            emptyBody="You have no administrator support requests yet."
          />
        )} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/trainer" replace />} />
      </Routes>
    </RoleShell>
  );
}

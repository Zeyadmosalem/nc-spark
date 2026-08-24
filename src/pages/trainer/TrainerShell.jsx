import { Routes, Route, Navigate } from 'react-router-dom';
import RoleShell from '../../components/shared/RoleShell';
import TrainerDashboard from './TrainerDashboard';
import TrainerReview from './TrainerReview';
import TrainerCourses from './TrainerCourses';
import CourseBuilder from '../../components/authoring/CourseBuilder';
import CourseRoster from '../../components/roster/CourseRoster';
import SupportThreads from '../../components/support/SupportThreads';
import { useSupportThreads } from '../../hooks/useSupport';
import AccountPage from '../shared/AccountPage';
import { usePendingReviews, useBlockedAttempts } from '../../hooks/useReview';

const NAV = [
  { to: '/trainer', end: true, icon: 'dashboard', label: 'Dashboard' },
  { to: '/trainer/courses', icon: 'courses', label: 'My Courses' },
  { to: '/trainer/review', icon: 'review', label: 'Review Work' },
  { to: '/trainer/support', icon: 'support', label: 'Support' },
  { section: 'Account' },
  { to: '/trainer/account', icon: 'account', label: 'My Account' },
];

export default function TrainerShell() {
  // Both queues are blocking for a trainee, so the count belongs where a
  // trainer looks first. Without it they only discover work by visiting the
  // page, and a trainee waits until they happen to.
  const pending = usePendingReviews();
  const blocked = useBlockedAttempts();
  const support = useSupportThreads();
  const waiting = (pending.data?.length ?? 0) + (blocked.data?.length ?? 0);

  // Both queues carry a count, because a trainer who does not visit the page
  // has no other way to learn that somebody is waiting on them.
  const asking = (support.data ?? [])
    .filter((t) => t.status === 'open' && t.awaitingStaff).length;

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
        {/* RLS decides what lands here: a request tagged with a course
            reaches whoever teaches it, and nothing else does. */}
        <Route path="support" element={(
          <SupportThreads
            eyebrow="Support"
            title="Questions from your trainees"
            subtitle="Requests naming one of your courses. Anything else goes to an administrator."
            emptyTitle="Nothing to answer"
            emptyBody="Nobody on your courses has asked for help. Requests that name one of them appear here."
          />
        )} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/trainer" replace />} />
      </Routes>
    </RoleShell>
  );
}

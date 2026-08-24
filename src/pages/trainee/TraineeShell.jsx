import { Routes, Route, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCourses, useMyEnrollments } from '../../hooks/useCourses';
import RoleShell from '../../components/shared/RoleShell';
import QueryError from '../../components/shared/QueryError';
import TraineeDashboard from './TraineeDashboard';
import CoursePage from './CoursePage';
import QuizPage from './QuizPage';
import ActivityPage from './ActivityPage';
import AchievementsPage from './AchievementsPage';
import CourseCatalog from './CourseCatalog';
import LibraryPage from './LibraryPage';
import SupportThreads from '../../components/support/SupportThreads';
import PageSkeleton from '../../components/ui/Skeleton';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { stagger, item, EASE_OUT } from '../../lib/motion';
import AccountPage from '../shared/AccountPage';

const NAV = [
  { to: '/trainee', end: true, icon: 'dashboard', label: 'Dashboard' },
  { to: '/trainee/courses', icon: 'courses', label: 'My Courses' },
  { to: '/trainee/library', icon: 'library', label: 'Library' },
  { to: '/trainee/catalog', icon: 'catalog', label: 'Course Catalog' },
  { to: '/trainee/achievements', icon: 'achievements', label: 'Achievements' },
  { section: 'Account' },
  { to: '/trainee/account', icon: 'account', label: 'My Account' },
  { to: '/trainee/support', icon: 'support', label: 'Support' },
];

export function MyCoursesPage() {
  const { data: enrollments, isLoading, error } = useMyEnrollments();
  const { data: courses, isLoading: coursesLoading, error: coursesError } = useCourses();

  // Both queries are needed to draw a single card: the enrollment supplies
  // progress, the course supplies its name. Waiting on only one of them means
  // every card misses its course lookup and the page renders blank mid-flight.
  if (isLoading || coursesLoading) {
    return <PageSkeleton label="Loading your courses" stats={0} rows={3} />;
  }

  // A failure is otherwise indistinguishable from "you are not enrolled in any
  // course yet", and the trainee is sent off to browse the catalog.
  const failure = error ?? coursesError;
  if (failure) {
    return (
      <div className="page-body">
        <QueryError error={failure} what="your courses" />
      </div>
    );
  }

  const byId = new Map((courses ?? []).map((c) => [c.id, c]));
  const active = (enrollments ?? []).filter(
    (e) => e.status === 'active' || e.status === 'completed'
  );

  return (
    <div className="page-body">
      <PageHeader
        eyebrow="My courses"
        icon="courses"
        title="Your courses"
        subtitle="Everything you are enrolled on, and how far through each one you are."
        actions={<Button to="/trainee/catalog" variant="secondary" icon="catalog">Find another</Button>}
      />

      {active.length === 0 ? (
        <EmptyState
          icon="courses"
          title="No courses yet"
          action={<Button to="/trainee/catalog" variant="primary" icon="catalog">Browse the catalog</Button>}
        >
          You are not enrolled in any course yet. Apply from the catalog and a
          trainer will approve you.
        </EmptyState>
      ) : (
        <motion.div className="course-grid" variants={stagger(0.06)} initial="hidden" animate="visible">
          {active.map((enrollment) => {
            const course = byId.get(enrollment.courseId);
            if (!course) return null;
            const accent = course.color || 'var(--brand-primary)';
            const percent = enrollment.percent ?? 0;
            const finished = percent >= 100;

            return (
              <motion.article key={enrollment.id} className="course-card" variants={item}>
                <div
                  className="course-card-header"
                  style={{ background: `linear-gradient(150deg, ${accent}, color-mix(in srgb, ${accent} 55%, #000))` }}
                >
                  <span className="course-card-icon" aria-hidden="true">{course.icon || '\u{1F4D8}'}</span>
                  <h2 className="course-card-title">{course.title}</h2>
                  {course.subtitle && (
                    <p className="course-card-subtitle">{course.subtitle}</p>
                  )}
                </div>

                <div className="course-card-body">
                  <p className="course-card-desc">{course.description}</p>
                  <div>
                    <div className="progress-label">
                      <span>{finished ? 'Complete' : 'Progress'}</span>
                      <span className="progress-value tabular">{percent}%</span>
                    </div>
                    <div
                      className="progress-track"
                      role="progressbar"
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${course.title} progress`}
                    >
                      {/*
                        Animated on arrival rather than jumping to width. The
                        bar is the one figure on this card somebody actually
                        looks for, so it is worth drawing the eye to.
                      */}
                      <motion.div
                        className="progress-fill"
                        data-complete={finished || undefined}
                        initial={{ width: 0 }}
                        animate={{ width: `${percent}%` }}
                        transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.15 }}
                      />
                    </div>
                  </div>
                </div>

                <div className="course-card-footer">
                  <Button to={`/trainee/courses/${course.id}`} variant="primary" block iconAfter="forward">
                    {percent === 0 ? 'Start' : finished ? 'Review' : 'Continue'}
                  </Button>
                </div>
              </motion.article>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

/**
 * The screen this replaced was the last thing in the product that lied.
 *
 * It rendered a name field, an email field and a message box, and its submit
 * handler was `alert('Support request submitted! (prototype only)')`. Nothing
 * was stored and nobody was told, so a trainee blocked on a course could fill
 * it in, read a confirmation, and wait for an answer that was never coming.
 *
 * The name and email fields are gone with it: the request is filed as whoever
 * is signed in, so asking them to type their own name was both redundant and
 * a way to file one under somebody else's.
 */
function SupportPage() {
  return (
    <SupportThreads
      canCreate
      eyebrow="Support"
      title="Get help"
      subtitle="Ask your trainer about a course, or an administrator about anything else."
      emptyTitle="No requests yet"
      emptyBody="Stuck on something? Ask, and the reply arrives here rather than in your inbox."
    />
  );
}

/*
 * The sidebar used to carry an XP panel here: a number from dummyData and a
 * progress bar hardcoded to 48% full. Nothing awards XP (backlog B7), so it
 * was a fabricated figure above a fabricated bar, on every trainee screen.
 * It returns with the gamification milestone.
 */
export default function TraineeShell() {
  return (
    <RoleShell navItems={NAV} title="NC Spark">
      <Routes>
        <Route index element={<TraineeDashboard />} />
        <Route path="courses" element={<MyCoursesPage />} />
        <Route path="catalog" element={<CourseCatalog />} />
        <Route path="courses/:courseId" element={<CoursePage />} />
        <Route path="activity/:activityId" element={<ActivityPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="support" element={<SupportPage />} />
        <Route path="library" element={<LibraryPage />} />
        {/*
          The prototype's two library screens. Both read invented data and both
          went with the store, but the question each answered was real, so they
          are one page with the filter preset rather than two redirects to a
          course list that answers neither.
        */}
        <Route path="quizzes" element={<LibraryPage initialKind="quiz" />} />
        <Route path="videos" element={<LibraryPage initialKind="video" />} />
        <Route path="quiz/:quizId" element={<QuizPage />} />
        <Route path="achievements" element={<AchievementsPage />} />
        <Route path="*" element={<Navigate to="/trainee" replace />} />
      </Routes>
    </RoleShell>
  );
}

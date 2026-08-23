import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { useCourses, useMyEnrollments } from '../../hooks/useCourses';
import RoleShell from '../../components/shared/RoleShell';
import QueryError from '../../components/shared/QueryError';
import TraineeDashboard from './TraineeDashboard';
import CoursePage from './CoursePage';
import QuizPage from './QuizPage';
import QuizPreview from './QuizPreview';
import ActivityPage from './ActivityPage';
import AchievementsPage from './AchievementsPage';
import CourseCatalog from './CourseCatalog';
import PageSkeleton from '../../components/ui/Skeleton';

const NAV = [
  { to: '/trainee', end: true, icon: '🏠', label: 'Dashboard' },
  { to: '/trainee/courses', icon: '📚', label: 'My Courses' },
  { to: '/trainee/catalog', icon: '🔍', label: 'Course Catalog' },
  { to: '/trainee/achievements', icon: '🏆', label: 'Achievements' },
  { section: 'Account' },
  { to: '/trainee/support', icon: '🎧', label: 'Support' },
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
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <p className="eyebrow">My Courses</p>
        <h1 className="section-heading">Learning Library</h1>
        <p className="section-sub">All your enrolled courses in one place.</p>
      </div>
      {active.length === 0 ? (
        <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-2)', marginBottom: '1rem' }}>
            You are not enrolled in any course yet.
          </p>
          <Link to="/trainee/catalog" className="btn btn-primary">Browse the catalog</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {active.map((enrollment) => {
            const course = byId.get(enrollment.courseId);
            if (!course) return null;
            const accent = course.color || '#002F6C';
            return (
              <div key={enrollment.id} className="course-card">
                <div className="course-card-header"
                     style={{ background: `linear-gradient(145deg, ${accent}dd, ${accent}aa)` }}>
                  <div className="course-card-icon">{course.icon || '📘'}</div>
                  <div className="course-card-title">{course.title}</div>
                  <div className="course-card-subtitle">{course.subtitle}</div>
                </div>
                <div className="course-card-body">
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                    {course.description}
                  </p>
                  <div>
                    <div className="course-progress-label">
                      <span>Progress</span>
                      <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>
                        {enrollment.percent}%
                      </span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${enrollment.percent}%` }} />
                    </div>
                  </div>
                </div>
                <div className="course-card-footer">
                  <Link to={`/trainee/courses/${course.id}`}
                        className="btn btn-primary btn-block btn-sm"
                        style={{ display: 'flex', textDecoration: 'none', justifyContent: 'center', alignItems: 'center' }}>
                    Open Course →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SupportPage() {
  return (
    <div className="page-body">
      <p className="eyebrow">Trainee Support</p>
      <h1 className="section-heading" style={{ marginBottom: '0.75rem' }}>Contact Academic Coaching</h1>
      <p className="section-sub" style={{ marginBottom: '2rem' }}>Submit a blocker or coaching request.</p>
      <div className="card no-hover" style={{ maxWidth: 520 }}>
        <form onSubmit={(e) => { e.preventDefault(); alert('Support request submitted! (prototype only)'); }} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {[{ label: 'Full Name', type: 'text', placeholder: 'Your name' }, { label: 'Email', type: 'email', placeholder: 'your@email.com' }].map((f) => (
            <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-2)' }}>{f.label}</label>
              <input type={f.type} placeholder={f.placeholder} style={{ padding: '0.7rem 0.9rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--border)', background: 'var(--surface-alt)', color: 'var(--text)', fontFamily: 'var(--font-body)' }} />
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-2)' }}>How can we help?</label>
            <textarea style={{ minHeight: 100, padding: '0.7rem 0.9rem', borderRadius: 'var(--r-md)', border: '1.5px solid var(--border)', background: 'var(--surface-alt)', color: 'var(--text)', fontFamily: 'var(--font-body)', resize: 'vertical' }} placeholder="Describe your issue..." />
          </div>
          <button type="submit" className="btn btn-primary">Send Request</button>
        </form>
      </div>
    </div>
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
        <Route path="support" element={<SupportPage />} />
        {/* Legacy routes, now accessible via course page */}
        <Route path="quizzes" element={<Navigate to="/trainee/courses" replace />} />
        <Route path="videos" element={<Navigate to="/trainee/courses" replace />} />
        <Route path="quiz/:quizId" element={<QuizPage />} />
        <Route path="quiz/preview" element={<QuizPreview />} />
        <Route path="achievements" element={<AchievementsPage />} />
        <Route path="*" element={<Navigate to="/trainee" replace />} />
      </Routes>
    </RoleShell>
  );
}

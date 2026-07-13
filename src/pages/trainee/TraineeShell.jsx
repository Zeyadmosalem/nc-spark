import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import Sidebar from '../../components/shared/Sidebar';
import TraineeDashboard from './TraineeDashboard';
import CoursePage from './CoursePage';
import QuizPage from './QuizPage';
import QuizPreview from './QuizPreview';
import ActivityPage from './ActivityPage';
import TraineeQuizzesPage from './TraineeQuizzesPage';
import AchievementsPage from './AchievementsPage';
import VideosPage from './VideosPage';
import CourseCatalog from './CourseCatalog';

const NAV = [
  { to: '/trainee', end: true, icon: '🏠', label: 'Dashboard' },
  { to: '/trainee/courses', icon: '📚', label: 'My Courses' },
  { to: '/trainee/catalog', icon: '🔍', label: 'Course Catalog' },
  { to: '/trainee/achievements', icon: '🏆', label: 'Achievements' },
  { section: 'Account' },
  { to: '/trainee/support', icon: '🎧', label: 'Support' },
];

function MyCoursesPage() {
  const { currentUser, courses } = useApp();
  const enrolled = courses.filter((c) => currentUser.enrolledCourses?.includes(c.id));
  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <p className="eyebrow">My Courses</p>
        <h1 className="section-heading">Learning Library</h1>
        <p className="section-sub">All your enrolled courses in one place.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {enrolled.map((course) => (
          <div key={course.id} className="course-card">
            <div className="course-card-header" style={{ background: `linear-gradient(145deg, ${course.color}dd, ${course.color}aa)` }}>
              <div className="course-card-icon">{course.icon}</div>
              <div className="course-card-title">{course.title}</div>
              <div className="course-card-subtitle">{course.subtitle}</div>
            </div>
            <div className="course-card-body">
              <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5 }}>{course.description}</p>
              <div>
                <div className="course-progress-label"><span>Progress</span><span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{course.progress}%</span></div>
                <div className="progress-track"><div className="progress-fill" style={{ width: `${course.progress}%` }} /></div>
              </div>
            </div>
            <div className="course-card-footer">
              <Link to={`/trainee/courses/${course.id}`} className="btn btn-primary btn-block btn-sm" style={{ display: 'flex', textDecoration: 'none', justifyContent: 'center', alignItems: 'center' }}>
                Open Course →
              </Link>
            </div>
          </div>
        ))}
      </div>
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

export default function TraineeShell() {
  const { currentUser } = useApp();

  return (
    <div className="app-shell">
      <Sidebar navItems={NAV} footerExtra={
        <div style={{ padding: '0.75rem', marginBottom: '0.5rem', background: 'rgba(0,47,108,0.15)', borderRadius: 'var(--r-lg)', border: '1px solid rgba(0,47,108,0.2)', textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginBottom: '0.25rem' }}>XP</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>{currentUser?.xp || 0}</div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 'var(--r-pill)', marginTop: '0.4rem', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '48%', background: 'linear-gradient(90deg, #002F6C, #00A3E0)', borderRadius: 'inherit' }} />
          </div>
        </div>
      } />
      <div className="main-content">
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
      </div>
    </div>
  );
}

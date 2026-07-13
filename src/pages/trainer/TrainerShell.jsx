import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import Sidebar from '../../components/shared/Sidebar';
import TrainerReview from './TrainerReview';
import CreateActivity from './CreateActivity';
import CreateQuiz from './CreateQuiz';
import CourseManagement from './CourseManagement';
import TrainerCoursePage from './TrainerCoursePage';
import TrainerCatalog from './TrainerCatalog';

const NAV = [
  { to: '/trainer', end: true, icon: '🏠', label: 'Dashboard' },
  { to: '/trainer/courses', icon: '📚', label: 'My Courses' },
  { to: '/trainer/catalog', icon: '🔍', label: 'Course Catalog' },
  { to: '/trainer/create', icon: '✨', label: 'Create Content' },
  { to: '/trainer/review', icon: '✅', label: 'Review Work' },
  { to: '/trainee/support', icon: '🎧', label: 'Support' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.4, ease: [0.4, 0, 0.2, 1] },
  }),
};

function Dashboard() {
  const { currentUser, courses, quizzes, trainees, pendingRequests, approveSecondAttempt, denySecondAttempt } = useApp();
  const navigate = useNavigate();
  const myCourses = courses.filter((c) => c.trainerId === currentUser.id);
  const myCourseIds = myCourses.map((c) => c.id);

  // Trainees enrolled in my courses
  const myTrainees = trainees.filter((t) =>
    t.enrolledCourses?.some((cId) => myCourseIds.includes(cId))
  );

  // Pending submissions across my quizzes
  const mySubmissions = Object.values(quizzes)
    .filter((q) => myCourseIds.includes(q.courseId))
    .flatMap((q) => (q.submissions || []).map((s) => ({ ...s, quizTitle: q.title, quizId: q.id })));
  const pendingSubmissions = mySubmissions.filter((s) => s.status === 'pending');

  // Pending second-attempt requests for my trainees
  const myTraineeIds = myTrainees.map((t) => t.id);
  const myRequests = pendingRequests.filter((r) => myTraineeIds.includes(r.traineeId));

  // Stats
  const totalQuizzes = Object.values(quizzes).filter((q) => myCourseIds.includes(q.courseId)).length;
  const avgTraineeXP = myTrainees.length > 0
    ? Math.round(myTrainees.reduce((a, t) => a + t.xp, 0) / myTrainees.length)
    : 0;

  return (
    <motion.div
      className="page-body"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
      initial="hidden"
      animate="visible"
    >
      {/* Welcome Hero */}
      <motion.div
        variants={fadeUp}
        custom={0}
        className="xp-hero"
        style={{ background: 'linear-gradient(145deg, rgba(0,47,108,0.95), rgba(0,62,126,0.92)), radial-gradient(500px 300px at 10% 10%, rgba(0,163,224,0.25), transparent), radial-gradient(500px 400px at 95% 5%, rgba(0,47,108,0.35), transparent)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Trainer Portal
            </p>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: '#fff', lineHeight: 1.1, marginBottom: '0.5rem' }}>
              Welcome back, {currentUser.name.split(' ')[0]} 👋
            </h1>
            <div className="level-badge">
              <span>📋</span>
              <span>Trainer</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700, color: '#fff' }}>{myTrainees.length}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Trainees</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700, color: '#fff' }}>{myCourses.length}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Courses</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <motion.div variants={fadeUp} custom={1} className="stat-grid stat-grid-4">
        {[
          { label: 'My Trainees', value: myTrainees.length, icon: '👥', color: 'var(--brand-primary)' },
          { label: 'Courses Managed', value: myCourses.length, icon: '📚', color: 'var(--brand-secondary)' },
          { label: 'Quizzes Created', value: totalQuizzes, icon: '📝', color: 'var(--brand-accent)' },
          { label: 'Avg Trainee XP', value: avgTraineeXP, icon: '⚡', color: '#b8860b' },
        ].map((s, i) => (
          <motion.div key={s.label} className="stat-card" whileHover={{ scale: 1.03, boxShadow: 'var(--shadow-md)' }} custom={i}>
            <div style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>{s.icon}</div>
            <div className="stat-card-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Main Grid */}
      <motion.div variants={fadeUp} custom={2} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* My Courses */}
          <div className="card no-hover">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>📚 My Courses</div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainer/courses')}>Manage →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {myCourses.map((course) => {
                const enrolledCount = trainees.filter((t) => t.enrolledCourses?.includes(course.id)).length;
                return (
                  <div key={course.id} className="student-row" style={{ cursor: 'default' }}>
                    <div style={{ fontSize: '1.5rem', width: '2.5rem', height: '2.5rem', background: `${course.color}22`, borderRadius: 'var(--r-lg)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{course.icon}</div>
                    <div className="student-row-info">
                      <div className="student-row-name">{course.title}</div>
                      <div className="student-row-meta">{course.subtitle}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-2)' }}>{enrolledCount} trainees</span>
                      <span style={{ color: 'var(--brand-primary)', fontWeight: 700 }}>{course.progress}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trainee Roster */}
          <div className="card no-hover">
            <div className="card-title">👥 My Trainees</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {myTrainees.map((t) => (
                <div key={t.id} className="student-row" style={{ cursor: 'default' }}>
                  <div className="avatar" style={{ width: '2rem', height: '2rem', fontSize: '0.7rem', flexShrink: 0 }}>{t.avatar}</div>
                  <div className="student-row-info">
                    <div className="student-row-name">{t.name}</div>
                    <div className="student-row-meta">{t.email}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{t.xp} XP</span>
                    <span style={{ color: '#ff6b35', fontWeight: 600 }}>🔥 {t.streak}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t.badges.length} badges</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Pending Reviews */}
          <div className="card no-hover">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>✅ Pending Reviews</div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainer/review')}>View All</button>
            </div>
            {pendingSubmissions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-3)' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', opacity: 0.5 }}>👍</div>
                <p style={{ fontSize: '0.85rem' }}>All caught up — no pending submissions.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {pendingSubmissions.slice(0, 4).map((s) => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', background: 'var(--surface-alt)', borderRadius: 'var(--r-md)', fontSize: '0.85rem' }}>
                    <div>
                      <strong>{s.traineeName}</strong>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{s.quizTitle}</div>
                    </div>
                    <span className="chip" style={{ fontSize: '0.7rem' }}>Pending</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Second Attempt Requests */}
          <div className="card no-hover">
            <div className="card-title">🔁 Second Attempt Requests</div>
            {myRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-3)' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', opacity: 0.5 }}>✨</div>
                <p style={{ fontSize: '0.85rem' }}>No pending requests.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {myRequests.map((req) => (
                  <div key={req.id} style={{ padding: '0.75rem', background: 'var(--surface-alt)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div className="avatar" style={{ width: '1.8rem', height: '1.8rem', fontSize: '0.6rem' }}>{req.avatar}</div>
                      <div>
                        <strong style={{ fontSize: '0.85rem' }}>{req.traineeName}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{req.quizTitle} · {req.score}%</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-success btn-sm" style={{ flex: 1 }} onClick={() => approveSecondAttempt(req.id)}>Approve</button>
                      <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={() => denySecondAttempt(req.id)}>Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="card no-hover">
            <div className="card-title">⚡ Quick Actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button className="btn btn-primary btn-block btn-sm" onClick={() => navigate('/trainer/create')}>✨ Create Activity</button>
              <button className="btn btn-outline btn-block btn-sm" onClick={() => navigate('/trainer/create/quiz')}>📝 Create Quiz</button>
              <button className="btn btn-ghost btn-block btn-sm" onClick={() => navigate('/trainer/review')}>✅ Review Submissions</button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CreateContentHub() {
  const navigate = useNavigate();
  return (
    <div className="page-body" style={{ maxWidth: 700, margin: '0 auto' }}>
      <p className="eyebrow">Create Content</p>
      <h1 className="section-heading" style={{ marginBottom: '2rem' }}>What would you like to create?</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <motion.div
          className="card"
          whileHover={{ scale: 1.02 }}
          onClick={() => navigate('/trainer/create/activity')}
          style={{ cursor: 'pointer', textAlign: 'center', padding: '2.5rem 1.5rem' }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✨</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: '0.5rem' }}>New Activity</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Create a video, reading, flashcard, matching, scenario, or file submission activity.</p>
        </motion.div>
        <motion.div
          className="card"
          whileHover={{ scale: 1.02 }}
          onClick={() => navigate('/trainer/create/quiz')}
          style={{ cursor: 'pointer', textAlign: 'center', padding: '2.5rem 1.5rem' }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: '0.5rem' }}>New Quiz</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Author MCQ, True/False, and short answer questions with a pass mark and time limit.</p>
        </motion.div>
      </div>
    </div>
  );
}

export default function TrainerShell() {
  return (
    <div className="app-shell">
      <Sidebar navItems={NAV} />
      <div className="main-content">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="courses" element={<CourseManagement />} />
          <Route path="catalog" element={<TrainerCatalog />} />
          <Route path="courses/:courseId" element={<TrainerCoursePage />} />
          <Route path="create" element={<CreateActivity />} />
          <Route path="create/activity" element={<CreateActivity />} />
          <Route path="create/quiz" element={<CreateQuiz />} />
          <Route path="review" element={<TrainerReview />} />
          <Route path="*" element={<Navigate to="/trainer" replace />} />
        </Routes>
      </div>
    </div>
  );
}

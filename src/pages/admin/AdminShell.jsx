import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import Sidebar from '../../components/shared/Sidebar';
import { ADMIN_STATS, USERS } from '../../data/dummyData';
import ContentManager from './ContentManager';
import UserManager from './UserManager';

const NAV = [
  { to: '/admin', end: true, icon: '🏠', label: 'Dashboard' },
  { to: '/admin/users', icon: '👥', label: 'User Management' },
  { to: '/admin/support', icon: '🎧', label: 'Support' },
  { to: '/admin/content', icon: '📚', label: 'Curriculum' },
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
  const { trainees, courses, quizzes, pendingCourseTeachingRequests, approveTeachingRequest } = useApp();

  // Compute live stats
  const totalSubmissions = Object.values(quizzes)
    .flatMap((q) => q.submissions || []).length;
  const reviewedSubmissions = Object.values(quizzes)
    .flatMap((q) => (q.submissions || []).filter((s) => s.status === 'reviewed')).length;

  const avgXP = trainees.length > 0
    ? Math.round(trainees.reduce((a, t) => a + t.xp, 0) / trainees.length)
    : 0;

  const activeLearners = trainees.filter((t) => t.streak > 0).length;

  return (
    <motion.div
      className="page-body"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
      initial="hidden"
      animate="visible"
    >
      {/* Hero */}
      <motion.div
        variants={fadeUp}
        custom={0}
        className="xp-hero"
        style={{ background: 'linear-gradient(145deg, rgba(0,0,0,0.92), rgba(10,10,18,0.95)), radial-gradient(500px 300px at 10% 10%, rgba(0,163,224,0.2), transparent), radial-gradient(500px 400px at 95% 5%, rgba(107,44,141,0.25), transparent)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
              Admin Console
            </p>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: '#fff', lineHeight: 1.1, marginBottom: '0.5rem' }}>
              Platform Overview
            </h1>
            <div className="level-badge">
              <span>⚙️</span>
              <span>Administrator</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700, color: '#fff' }}>{activeLearners}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Active Learners</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.15)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700, color: '#fff' }}>{avgXP}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Avg XP</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={fadeUp} custom={1} className="stat-grid stat-grid-4">
        {[
          { label: 'Trainees', value: ADMIN_STATS.totalTrainees, icon: '🎓', color: 'var(--brand-primary)' },
          { label: 'Trainers', value: ADMIN_STATS.totalTrainers, icon: '📋', color: 'var(--brand-secondary)' },
          { label: 'Supervisors', value: ADMIN_STATS.totalSupervisors, icon: '👁️', color: 'var(--brand-accent)' },
          { label: 'Courses', value: ADMIN_STATS.totalCourses, icon: '📚', color: '#b8860b' },
        ].map((s, i) => (
          <motion.div key={s.label} className="stat-card" whileHover={{ scale: 1.03, boxShadow: 'var(--shadow-md)' }} custom={i}>
            <div style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>{s.icon}</div>
            <div className="stat-card-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Analytics Grid */}
      <motion.div variants={fadeUp} custom={2} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Platform Health */}
        <div className="card no-hover">
          <div className="card-title">📊 Platform Analytics</div>
          <div className="improve-list">
            {[
              { topic: 'Average Completion Rate', score: ADMIN_STATS.avgCompletion },
              { topic: 'Quiz Pass Rate', score: ADMIN_STATS.quizPassRate },
              { topic: 'Active Learners Today', score: Math.round((activeLearners / trainees.length) * 100) },
            ].map((a) => (
              <div key={a.topic}>
                <div className="improve-item-row">
                  <span style={{ fontSize: '0.875rem' }}>{a.topic}</span>
                  <span className="improve-item-score">{a.score}%</span>
                </div>
                <div className="progress-track">
                  <motion.div className="progress-fill" initial={{ width: 0 }} animate={{ width: `${a.score}%` }} transition={{ duration: 0.8 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Submission Stats */}
        <div className="card no-hover">
          <div className="card-title">📝 Submission Overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
            <div style={{ textAlign: 'center', padding: '1.25rem', background: 'var(--surface-alt)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--heading)' }}>{totalSubmissions}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Total Submissions</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1.25rem', background: 'var(--surface-alt)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 700, color: '#198754' }}>{reviewedSubmissions}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Reviewed</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1.25rem', background: 'var(--surface-alt)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--brand-accent)' }}>{totalSubmissions - reviewedSubmissions}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Pending Review</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1.25rem', background: 'var(--surface-alt)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.8rem', fontWeight: 700, color: 'var(--heading)' }}>{Object.keys(quizzes).length}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Total Quizzes</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Teaching Requests */}
      {pendingCourseTeachingRequests.length > 0 && (
        <motion.div variants={fadeUp} custom={3} className="card no-hover" style={{ borderColor: 'var(--brand-accent)' }}>
          <div className="card-title">👨‍🏫 Pending Course Teaching Requests</div>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {pendingCourseTeachingRequests.map((req, idx) => {
              const courseName = courses.find(c => c.id === req.courseId)?.title || req.courseId;
              return (
                <div key={idx} className="student-row" style={{ cursor: 'default' }}>
                  <div className="student-row-info">
                    <div className="student-row-name">{req.trainerName}</div>
                    <div className="student-row-meta">Wants to teach: {courseName}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => approveTeachingRequest(req.trainerId, req.courseId)}>Approve</button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Top Performers */}
      <motion.div variants={fadeUp} custom={4} className="card no-hover">
        <div className="card-title">🏆 Top Performing Trainees</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[...trainees].sort((a, b) => b.xp - a.xp).slice(0, 5).map((t, i) => (
            <div key={t.id} className="student-row" style={{ cursor: 'default' }}>
              <div style={{ width: '1.8rem', height: '1.8rem', borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '0.85rem', fontWeight: 700, background: i < 3 ? ['rgba(232,179,77,0.15)', 'rgba(192,192,192,0.15)', 'rgba(205,127,50,0.15)'][i] : 'var(--surface-alt)', color: i < 3 ? ['#e8b34d', '#999', '#cd7f32'][i] : 'var(--text-3)', flexShrink: 0 }}>
                {i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`}
              </div>
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
      </motion.div>
    </motion.div>
  );
}



export default function AdminShell() {
  return (
    <div className="app-shell">
      <Sidebar navItems={NAV} />
      <div className="main-content">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<UserManager />} />
          <Route path="content" element={<ContentManager />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </div>
  );
}

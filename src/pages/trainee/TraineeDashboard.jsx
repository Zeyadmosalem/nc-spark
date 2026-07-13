import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { XPHero, BadgeGrid, LeaderboardWidget } from '../../components/gamification/GamificationWidgets';
import ProgressRing from '../../components/gamification/ProgressRing';
import LearningPathMap from '../../components/journey/LearningPathMap';

const fadeUp = { hidden: { opacity: 0, y: 24 }, visible: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.45, ease: [0.4, 0, 0.2, 1] } }) };

export default function TraineeDashboard() {
  const { currentUser, courses, learningPaths, pendingCourseEnrollments } = useApp();
  const navigate = useNavigate();

  const enrolledCourses = courses.filter((c) => currentUser.enrolledCourses?.includes(c.id));
  const pendingCourseIds = pendingCourseEnrollments?.filter(req => req.traineeId === currentUser.id).map(req => req.courseId) || [];
  const pendingCourses = courses.filter((c) => pendingCourseIds.includes(c.id));
  const allDisplayCourses = [...enrolledCourses, ...pendingCourses];
  
  const currentCourse = enrolledCourses[0] || pendingCourses[0];
  const activePath = learningPaths.find(p => p.courseId === currentCourse?.id) || learningPaths[0];

  return (
    <motion.div
      className="page-body"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
      initial="hidden"
      animate="visible"
    >
      {/* XP Hero */}
      <motion.div variants={fadeUp} custom={0}><XPHero /></motion.div>

      {/* Quick Stats */}
      <motion.div variants={fadeUp} custom={1} className="stat-grid stat-grid-4">
        {[
          { label: 'Overall Progress', value: `${Math.round(enrolledCourses.reduce((a, c) => a + c.progress, 0) / (enrolledCourses.length || 1))}%`, icon: '📈', color: 'var(--brand-primary)' },
          { label: 'Courses Enrolled', value: enrolledCourses.length, icon: '📚', color: 'var(--brand-secondary)' },
          { label: 'Weekly Goal', value: '3 / 5', icon: '🎯', color: 'var(--brand-accent)' },
          { label: 'Badges Earned', value: currentUser.badges.length, icon: '🏅', color: '#b8860b' },
        ].map((s, i) => (
          <motion.div key={s.label} className="stat-card" whileHover={{ scale: 1.03, boxShadow: 'var(--shadow-md)' }} custom={i}>
            <div style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>{s.icon}</div>
            <div className="stat-card-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-card-label">{s.label}</div>
          </motion.div>
        ))}
      </motion.div>

      {/* Learning Path */}
      {activePath && (
        <motion.div variants={fadeUp} custom={2} className="card no-hover">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <p className="eyebrow">Your Learning Path</p>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', color: 'var(--heading)' }}>{activePath.title}</h2>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate(`/trainee/courses/${currentCourse?.id}`)}>
                Resume Path →
              </button>
            </div>
          </div>
          <LearningPathMap path={activePath} />
        </motion.div>
      )}

      {/* Dashboard Grid */}
      <motion.div variants={fadeUp} custom={3} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* My Courses */}
          <div className="card no-hover">
            <div className="card-title">📚 My Courses</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {allDisplayCourses.map((course) => {
                const isPending = pendingCourseIds.includes(course.id);
                return (
                  <motion.div
                    key={course.id}
                    className="student-row"
                    whileHover={{ x: isPending ? 0 : 4 }}
                    onClick={() => !isPending && navigate(`/trainee/courses/${course.id}`)}
                    style={{ cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
                  >
                    <div style={{ fontSize: '1.5rem', width: '2.5rem', height: '2.5rem', background: `${course.color}22`, borderRadius: 'var(--r-lg)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{course.icon}</div>
                    <div className="student-row-info">
                      <div className="student-row-name">{course.title} {isPending && '(Pending)'}</div>
                      <div className="student-row-meta">{course.subtitle}</div>
                    </div>
                    {isPending ? (
                      <span className="chip">⏳ Pending Approval</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <ProgressRing radius={24} stroke={4} progress={course.progress} />
                        <span style={{ fontSize: '0.9rem', color: 'var(--text-3)' }}>→</span>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Improvement Areas */}
          {currentCourse && (
            <div className="card no-hover">
              <div className="card-title">📊 Areas to Improve — {currentCourse.title}</div>
              <div className="improve-list">
                {currentCourse.improvementAreas.map((area) => (
                  <div key={area.topic}>
                    <div className="improve-item-row">
                      <span style={{ fontSize: '0.875rem' }}>{area.topic}</span>
                      <span className="improve-item-score">{area.score}%</span>
                    </div>
                    <div className="progress-track">
                      <motion.div className="progress-fill" initial={{ width: 0 }} animate={{ width: `${area.score}%` }} transition={{ duration: 0.8, delay: 0.2 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Leaderboard */}
          <div className="card no-hover">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>🏆 Leaderboard</div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainee/achievements')}>View all</button>
            </div>
            <LeaderboardWidget limit={5} currentUserId={currentUser.id} />
          </div>

          {/* Badges preview */}
          <div className="card no-hover">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>🏅 Your Badges</div>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainee/achievements')}>View all</button>
            </div>
            <BadgeGrid earned={currentUser.badges} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

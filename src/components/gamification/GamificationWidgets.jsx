import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { BADGES, LEVELS } from '../../data/dummyData';

export function XPHero() {
  const { currentUser, userLevel, userLevelProgress } = useApp();
  if (!currentUser) return null;

  const nextLevel = LEVELS[LEVELS.indexOf(userLevel) + 1];
  const xpToNext = nextLevel ? nextLevel.min - currentUser.xp : 0;

  return (
    <div className="xp-hero">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
            Welcome back
          </p>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: '#fff', lineHeight: 1.1, marginBottom: '0.75rem' }}>
            {currentUser.name.split(' ')[0]} 👋
          </h1>
          <div className="level-badge">
            <span>{userLevel?.icon}</span>
            <span>{userLevel?.label}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700, color: '#fff' }}>{currentUser.streak}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <motion.span 
                animate={{ scale: [1, 1.2, 1], rotate: [-5, 5, -5] }} 
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              >
                🔥
              </motion.span> 
              Day Streak
            </div>
          </div>
          <div style={{ width: 1, height: 40, background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700, color: '#fff' }}>{currentUser.xp}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Total XP</div>
          </div>
        </div>
      </div>

      <div className="xp-bar-container">
        <div className="xp-bar-labels">
          <span>{userLevel?.label} · {currentUser.xp} XP</span>
          <span>{nextLevel ? `${xpToNext} XP to ${nextLevel.label}` : '🏆 Max Level!'}</span>
        </div>
        <div className="xp-bar-track">
          <motion.div
            className="xp-bar-fill"
            initial={{ width: 0 }}
            animate={{ width: `${userLevelProgress}%` }}
            transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
          />
        </div>
      </div>

      <div className="hero-stats-row">
        {[
          { label: 'Badges', value: currentUser.badges.length, icon: '🏅' },
          { label: 'Courses', value: currentUser.enrolledCourses?.length || 0, icon: '📚' },
          { label: 'Quizzes Done', value: Object.keys(currentUser.quizAttempts || {}).length, icon: '✅' },
          { label: 'Streak', value: `${currentUser.streak}d`, icon: '🔥' },
        ].map((stat) => (
          <motion.div key={stat.label} className="hero-stat" whileHover={{ scale: 1.04 }}>
            <div style={{ fontSize: '1.2rem' }}>{stat.icon}</div>
            <div className="hero-stat-value">{stat.value}</div>
            <div className="hero-stat-label">{stat.label}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function BadgeGrid({ earned, showAll = false }) {
  const allBadges = Object.values(BADGES);
  const display = showAll ? allBadges : allBadges;

  return (
    <div className="badge-grid">
      {display.map((badge, i) => {
        const isEarned = earned.includes(badge.id);
        return (
          <motion.div
            key={badge.id}
            className={`badge-item${isEarned ? '' : ' locked'}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05, type: 'spring', stiffness: 300 }}
            title={isEarned ? badge.desc : `Locked: ${badge.desc}`}
          >
            <div className="badge-icon">{isEarned ? badge.icon : '🔒'}</div>
            <div className="badge-label">{badge.label}</div>
            {isEarned && <div style={{ fontSize: '0.65rem', color: 'var(--brand-primary)', fontWeight: 700 }}>+{badge.xpReward} XP</div>}
          </motion.div>
        );
      })}
    </div>
  );
}

export function LeaderboardWidget({ limit = 5, currentUserId }) {
  const { trainees } = useApp();
  const sorted = [...trainees].sort((a, b) => b.xp - a.xp).slice(0, limit);

  const rankClass = (i) => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';

  return (
    <div className="leaderboard-list">
      {sorted.map((s, i) => (
        <motion.div
          key={s.id}
          className={`leaderboard-item${s.id === currentUserId ? ' me' : ''}`}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.07 }}
        >
          <div className={`leaderboard-rank ${rankClass(i)}`}>
            {i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${i + 1}`}
          </div>
          <div className="avatar" style={{ width: '1.8rem', height: '1.8rem', fontSize: '0.65rem' }}>{s.avatar}</div>
          <div className="leaderboard-info">
            <div className="leaderboard-name">{s.id === currentUserId ? `${s.name} (you)` : s.name}</div>
            <div className="leaderboard-xp">{s.xp} XP</div>
          </div>
          <div className="leaderboard-streak">🔥 {s.streak}</div>
        </motion.div>
      ))}
    </div>
  );
}

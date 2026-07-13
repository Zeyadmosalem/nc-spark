import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { BadgeGrid, LeaderboardWidget } from '../../components/gamification/GamificationWidgets';
import { LEVELS } from '../../data/dummyData';

export default function AchievementsPage() {
  const { currentUser, userLevel, userLevelProgress, trainees } = useApp();
  if (!currentUser) return null;

  const myRank = [...trainees].sort((a, b) => b.xp - a.xp).findIndex((s) => s.id === currentUser.id) + 1;

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Rank Hero */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'linear-gradient(145deg, rgba(0,0,0,0.88), rgba(15,15,25,0.92)), radial-gradient(500px 300px at 10% 10%, rgba(204,51,102,0.3), transparent), radial-gradient(500px 400px at 95% 5%, rgba(107,44,141,0.35), transparent)',
          borderRadius: 'var(--r-xl)', padding: '2.5rem', color: '#fff',
        }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2rem', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Your Ranking</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '4rem', fontWeight: 700, lineHeight: 1 }}>#{myRank}</span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1rem' }}>of {trainees.length} trainees</span>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="level-badge"><span>{userLevel?.icon}</span><span>{userLevel?.label}</span></div>
              <div className="level-badge"><span>⚡</span><span>{currentUser.xp} XP</span></div>
              <div className="level-badge"><span>🔥</span><span>{currentUser.streak}-day streak</span></div>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '5rem', lineHeight: 1, marginBottom: '0.5rem' }}>{userLevel?.icon}</div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700 }}>{userLevel?.label}</div>
          </div>
        </div>

        {/* XP Bar */}
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.5rem' }}>
            <span>{currentUser.xp} XP · {userLevel?.label}</span>
            <span>{userLevelProgress}% to next level</span>
          </div>
          <div style={{ height: 10, borderRadius: 'var(--r-pill)', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${userLevelProgress}%` }} transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
              style={{ height: '100%', background: 'linear-gradient(90deg, #6b2c8d, #cc3366, #ff8c42)', borderRadius: 'inherit' }} />
          </div>
        </div>
      </motion.div>

      {/* Levels Road */}
      <div className="card no-hover">
        <div className="card-title">🗺️ Level Path</div>
        <div style={{ display: 'flex', gap: '0', overflowX: 'auto', paddingBottom: '0.5rem' }}>
          {LEVELS.map((level, i) => {
            const isCurrentLevel = level.label === userLevel?.label;
            const isPast = currentUser.xp > level.max;
            return (
              <div key={level.label} style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
                <motion.div whileHover={{ scale: 1.05 }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem',
                    padding: '1rem 1.25rem', borderRadius: 'var(--r-lg)', minWidth: 100, textAlign: 'center',
                    background: isCurrentLevel ? 'rgba(107,44,141,0.12)' : isPast ? 'rgba(25,135,84,0.08)' : 'var(--surface-alt)',
                    border: `2px solid ${isCurrentLevel ? 'var(--brand-purple)' : isPast ? '#198754' : 'var(--border)'}`,
                  }}>
                  <div style={{ fontSize: '2rem' }}>{isPast && !isCurrentLevel ? '✅' : level.icon}</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: isCurrentLevel ? 'var(--brand-purple)' : 'var(--heading)' }}>{level.label}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{level.min}+ XP</div>
                  {isCurrentLevel && <div className="chip" style={{ fontSize: '0.65rem', padding: '0.15rem 0.5rem' }}>Current</div>}
                </motion.div>
                {i < LEVELS.length - 1 && (
                  <div style={{ width: 32, height: 2, background: isPast ? 'var(--brand-purple)' : 'var(--border)', flexShrink: 0 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem' }}>
        {/* All Badges */}
        <div className="card no-hover">
          <div className="card-title">🏅 All Badges ({currentUser.badges.length} earned)</div>
          <BadgeGrid earned={currentUser.badges} showAll />
        </div>
        {/* Full Leaderboard */}
        <div className="card no-hover">
          <div className="card-title">🏆 Full Leaderboard</div>
          <LeaderboardWidget limit={10} currentUserId={currentUser.id} />
        </div>
      </div>
    </div>
  );
}

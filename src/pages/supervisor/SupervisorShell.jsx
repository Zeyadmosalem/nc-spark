import { Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import Sidebar from '../../components/shared/Sidebar';
import ContentReview from './ContentReview';
import SupervisorCourses from './SupervisorCourses';
import SupervisorCoursePage from './SupervisorCoursePage';

const NAV = [
  { to: '/supervisor', end: true, icon: '🏠', label: 'Dashboard' },
  { to: '/supervisor/courses', icon: '📚', label: 'Team Courses' },
  { to: '/supervisor/content', icon: '✅', label: 'Review Content' },
  { to: '/trainee/support', icon: '🎧', label: 'Support' },
];

function Dashboard() {
  const { currentUser, getTeamReport, pendingRequests, approveSecondAttempt, denySecondAttempt } = useApp();

  const report = getTeamReport(currentUser.id);
  
  // Flatten trainees array to get requests for managed trainees
  const managedTraineeIds = report?.trainerReports.flatMap(tr => tr.trainees.map(t => t.id)) || [];
  const myPendingRequests = pendingRequests.filter(req => managedTraineeIds.includes(req.traineeId));

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="page-header">
        <div className="page-header-left">
          <h1>Supervisor Dashboard</h1>
          <p>Team Overview & Approvals</p>
        </div>
      </div>
      
        {/* Key Metrics */}
        <div className="stat-grid stat-grid-4">
          <div className="stat-card">
            <div className="stat-card-label">Managed Trainers</div>
            <div className="stat-card-value">{report?.trainerReports.length || 0}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Total Trainees</div>
            <div className="stat-card-value">
              {report?.trainerReports.reduce((sum, tr) => sum + tr.totalTrainees, 0) || 0}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Avg Trainee XP</div>
            <div className="stat-card-value">
              {report?.trainerReports.length > 0 
                ? Math.round(report.trainerReports.reduce((sum, tr) => sum + tr.avgXP, 0) / report.trainerReports.length)
                : 0}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Pending Requests</div>
            <div className="stat-card-value" style={{ color: myPendingRequests.length > 0 ? 'var(--brand-accent)' : 'inherit' }}>
              {myPendingRequests.length}
            </div>
          </div>
        </div>

        <div className="dashboard-grid dashboard-grid-main">
          {/* Left Column: Team Reports */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h2 className="section-heading" style={{ fontSize: '1.25rem' }}>Trainer Cohorts</h2>
            
            {report?.trainerReports.map(tr => (
              <div key={tr.trainer.id} className="supervisor-team-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
                  <div className="avatar">{tr.trainer.avatar}</div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{tr.trainer.name}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{tr.courses.map(c => c.title).join(', ')}</p>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>Avg XP</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--brand-primary)' }}>{tr.avgXP}</div>
                  </div>
                </div>
                
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem' }}>
                  Trainees ({tr.totalTrainees})
                </div>
                
                {tr.trainees.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {tr.trainees.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'var(--surface-alt)', borderRadius: 'var(--r-sm)' }}>
                        <div className="avatar" style={{ width: '1.5rem', height: '1.5rem', fontSize: '0.6rem' }}>{t.avatar}</div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 500, flex: 1 }}>{t.name}</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--brand-secondary)' }}>{t.xp} XP</span>
                        <span style={{ fontSize: '0.8rem', color: '#ff6b35', fontWeight: 600 }}>🔥 {t.streak}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', fontStyle: 'italic' }}>No trainees assigned</p>
                )}
              </div>
            ))}
          </div>

          {/* Right Column: Pending Approvals */}
          <div>
            <h2 className="section-heading" style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Approvals</h2>
            
            {myPendingRequests.length === 0 ? (
              <div className="card no-hover" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }}>👍</div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.25rem' }}>All Caught Up</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>No pending requests from your team.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {myPendingRequests.map((req) => (
                  <div key={req.id} className="request-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div className="avatar">{req.avatar}</div>
                      <div className="request-info">
                        <strong>{req.traineeName}</strong>
                        <div className="request-quiz">{req.quizTitle}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '4px' }}>Requested {req.requestedAt}</div>
                      </div>
                      <div className="request-score" style={{ color: req.score < 50 ? '#dc3545' : '#b8860b' }}>
                        {req.score}%
                      </div>
                    </div>
                    <div className="request-actions" style={{ marginTop: '1rem' }}>
                      <button className="btn btn-success" style={{ flex: 1, padding: '0.4rem' }} onClick={() => approveSecondAttempt(req.id)}>Approve</button>
                      <button className="btn btn-danger" style={{ flex: 1, padding: '0.4rem' }} onClick={() => denySecondAttempt(req.id)}>Deny</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
    </div>
  );
}

export default function SupervisorShell() {
  const { currentUser } = useApp();
  
  if (currentUser?.role !== 'supervisor') return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <Sidebar navItems={NAV} />
      <div className="main-content">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="courses" element={<SupervisorCourses />} />
          <Route path="courses/:courseId" element={<SupervisorCoursePage />} />
          <Route path="content" element={<ContentReview />} />
          <Route path="*" element={<Navigate to="/supervisor" replace />} />
        </Routes>
      </div>
    </div>
  );
}

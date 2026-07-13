import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

export default function SupervisorCourses() {
  const { currentUser, getTeamReport, trainees } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const report = getTeamReport(currentUser.id);
  
  // Aggregate all courses taught by trainers under this supervisor
  const managedCourses = [];
  if (report) {
    report.trainerReports.forEach(tr => {
      tr.courses.forEach(c => {
        if (!managedCourses.some(mc => mc.id === c.id)) {
          managedCourses.push({ ...c, trainerName: tr.trainer.name });
        }
      });
    });
  }

  const filtered = managedCourses.filter(c => 
    c.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.trainerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-body">
      <p className="eyebrow">Team Overview</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="section-heading" style={{ margin: 0 }}>Courses Taught by Team</h1>
        <input 
          className="input-field" 
          placeholder="Search by course or trainer..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: '1 1 300px', maxWidth: '400px' }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5 }}>📚</div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>No Courses Found</h3>
          <p style={{ color: 'var(--text-2)' }}>No courses are currently being taught by trainers in your team.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {filtered.map(course => {
            const enrolledCount = trainees.filter((t) => t.enrolledCourses?.includes(course.id)).length;
            return (
              <div key={course.id} className="course-card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/supervisor/courses/${course.id}`)}>
                <div className="course-card-header" style={{ background: `linear-gradient(145deg, ${course.color}dd, ${course.color}aa)` }}>
                  <div className="course-card-icon">{course.icon}</div>
                  <div className="course-card-title">{course.title}</div>
                  <div className="course-card-subtitle">{course.subtitle}</div>
                </div>
                <div className="course-card-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Trainer: <strong>{course.trainerName}</strong></div>
                    <div className="chip">{enrolledCount} Trainees</div>
                  </div>
                  <div>
                    <div className="course-progress-label"><span>Avg Progress</span><span style={{ fontWeight: 700, color: 'var(--brand-primary)' }}>{course.progress}%</span></div>
                    <div className="progress-track"><div className="progress-fill" style={{ width: `${course.progress}%` }} /></div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function TrainerCatalog() {
  const { courses, currentUser, requestCourseTeaching, pendingCourseTeachingRequests } = useApp();
  const [searchTerm, setSearchTerm] = useState('');

  // Filter out courses the trainer is already assigned to
  const availableCourses = courses.filter(
    (c) => c.trainerId !== currentUser.id
  );

  const filtered = availableCourses.filter(c => 
    c.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-body">
      <p className="eyebrow">Discover</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="section-heading" style={{ margin: 0 }}>Course Catalog</h1>
        <input 
          className="input-field" 
          placeholder="Search courses..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: '1 1 300px', maxWidth: '400px' }}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5 }}>🔍</div>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>No Courses Found</h3>
          <p style={{ color: 'var(--text-2)' }}>Try adjusting your search or you might already be teaching all available courses!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {filtered.map(c => {
            const isPending = pendingCourseTeachingRequests?.some(req => req.trainerId === currentUser.id && req.courseId === c.id);
            return (
              <div key={c.id} className="card">
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '2.5rem', width: '4rem', height: '4rem', background: `${c.color}22`, borderRadius: 'var(--r-xl)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{c.icon}</div>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{c.title}</h2>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-3)' }}>{c.totalModules} Modules • Current Instructor: {c.trainerId === 't1' ? 'Unassigned' : c.trainerId}</div>
                  </div>
                </div>
                <p style={{ fontSize: '0.95rem', color: 'var(--text-2)', marginBottom: '1.5rem', flex: 1 }}>{c.description}</p>
                {isPending ? (
                  <button className="btn btn-secondary" style={{ width: '100%', cursor: 'not-allowed', opacity: 0.8 }} disabled>
                    ⏳ Pending Admin Approval
                  </button>
                ) : (
                  <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => requestCourseTeaching(c.id)}>
                    ✨ Request to Teach
                  </button>
                )}
              </div>
            );
          })}</div>
      )}
    </div>
  );
}

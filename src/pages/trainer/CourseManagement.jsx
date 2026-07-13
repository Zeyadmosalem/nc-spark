import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

export default function CourseManagement() {
  const { currentUser, courses, pendingCourseEnrollments, trainees, approveEnrollment, pendingCourseTeachingRequests, requestCourseTeaching } = useApp();
  const [activeTab, setActiveTab] = useState('enrollments');
  const navigate = useNavigate();
  
  // Filter pending enrollments for courses this trainer manages
  const myCoursesIds = courses.filter(c => c.trainerId === currentUser?.id).map(c => c.id);
  const myPendingEnrollments = pendingCourseEnrollments.filter(req => myCoursesIds.includes(req.courseId));

  return (
    <div className="page-body">
      <p className="eyebrow">Course Management</p>
      <h1 className="section-heading" style={{ marginBottom: '2rem' }}>My Courses & Students</h1>

      <div className="tab-navigation" style={{ marginBottom: '2rem' }}>
        <button className={`tab-item ${activeTab === 'enrollments' ? 'active' : ''}`} onClick={() => setActiveTab('enrollments')}>Enrollment Requests</button>
        <button className={`tab-item ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')}>Course Catalog</button>
      </div>

      {activeTab === 'enrollments' && (
        <div>
          <h3 style={{ marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>Pending Course Enrollments</h3>
          {/* Note: Dummy data currently uses pendingRequests for Quiz attempts, we'll reuse the UI style for enrollments */}
          {myPendingEnrollments.length === 0 ? (
             <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
               <div style={{ fontSize: '2.5rem', marginBottom: '1rem', opacity: 0.5 }}>👥</div>
               <h3 style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>No Pending Enrollments</h3>
               <p style={{ color: 'var(--text-2)' }}>All caught up on student requests.</p>
             </div>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {myPendingEnrollments.map((req, i) => {
                const trainee = trainees.find(t => t.id === req.traineeId);
                const course = courses.find(c => c.id === req.courseId);
                return (
                  <div key={`${req.traineeId}-${req.courseId}-${i}`} className="card no-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div className="avatar">{trainee?.avatar || '??'}</div>
                      <div>
                        <strong>{trainee?.name || 'Unknown'}</strong>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Requested to join: {course?.title}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-success btn-sm" onClick={() => approveEnrollment(req.traineeId, req.courseId)}>Approve</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'catalog' && (
        <div>
          <h3 style={{ marginBottom: '1rem', fontFamily: 'var(--font-heading)' }}>Available Courses to Teach</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {courses.map(course => {
              const isMine = course.trainerId === currentUser.id;
              return (
                <div key={course.id} className="card no-hover" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '2rem', width: '3rem', height: '3rem', background: `${course.color}22`, borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center' }}>{course.icon}</div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{course.title}</h3>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{course.totalModules} Modules</div>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-2)', flex: 1, marginBottom: '1.5rem' }}>{course.description}</p>
                  {isMine ? (
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate(`/trainer/courses/${course.id}`)}>
                      View Course
                    </button>
                  ) : pendingCourseTeachingRequests.some(req => req.courseId === course.id && req.trainerId === currentUser.id) ? (
                    <button className="btn btn-outline" style={{ width: '100%', opacity: 0.7 }} disabled>
                      ⏳ Request Pending
                    </button>
                  ) : (
                    <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => requestCourseTeaching(course.id)}>
                      Request to Teach
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

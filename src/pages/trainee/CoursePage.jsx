import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import JourneyMap from '../../components/journey/JourneyMap';

export default function CoursePage() {
  const { courseId } = useParams();
  const { courses, currentUser, pendingCourseEnrollments, addXP, activities, quizzes, chatMessages, sendChatMessage } = useApp();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('video');
  const [chatText, setChatText] = useState('');
  const chatScrollRef = useRef(null);

  const course = courses.find((c) => c.id === courseId);
  if (!course) return <div className="page-body"><p>Course not found.</p></div>;

  const isEnrolled = currentUser.enrolledCourses?.includes(course.id);
  const isPending = pendingCourseEnrollments?.some(req => req.traineeId === currentUser.id && req.courseId === course.id);

  if (!isEnrolled) {
    return (
      <div className="page-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainee/courses')}>← Back to Courses</button>
        </div>
        <div className="card no-hover" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>{isPending ? 'Enrollment Pending' : 'Course Locked'}</h2>
          <p style={{ color: 'var(--text-2)', maxWidth: '40ch', margin: '0 auto 1.5rem' }}>
            {isPending 
              ? 'Your request to join this course has been sent to the trainer. You will gain access once they approve it.' 
              : 'You are not enrolled in this course. Please visit the Course Catalog to apply.'}
          </p>
          {!isPending && (
            <button className="btn btn-primary" onClick={() => navigate('/trainee/catalog')}>Go to Course Catalog</button>
          )}
        </div>
      </div>
    );
  }

  const quizAttempt = currentUser.quizAttempts?.[course.quizId];
  const completedStages = course.stages.filter((s) => s.status === 'done').length;
  
  // Chat logic
  const messages = chatMessages[courseId] || [];
  function handleSendChat(e) {
    e.preventDefault();
    if (!chatText.trim()) return;
    sendChatMessage(courseId, chatText.trim());
    setChatText('');
  }

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeTab === 'chat' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainee/courses')}>← Back to Courses</button>
      </div>

      {/* Course Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        style={{
          borderRadius: 'var(--r-xl)', padding: '2rem', color: '#fff', position: 'relative', overflow: 'hidden',
          background: `linear-gradient(145deg, rgba(0,0,0,0.82), rgba(15,15,25,0.88)), linear-gradient(135deg, ${course.color}88, ${course.color}44)`
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '3rem', background: `${course.color}33`, padding: '1rem', borderRadius: 'var(--r-xl)', border: `1px solid ${course.color}44` }}>{course.icon}</div>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Course Hub</p>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.5rem, 4vw, 2rem)', color: '#fff', marginBottom: '0.5rem' }}>{course.title}</h1>
            <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.75)', maxWidth: '60ch' }}>{course.description}</p>
          </div>
          <div style={{ textAlign: 'right', minWidth: '150px' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '3rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>{course.progress}%</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Overall Progress</div>
            <div className="progress-track" style={{ marginTop: '0.5rem', background: 'rgba(255,255,255,0.15)', width: '100%', maxWidth: 120, marginLeft: 'auto' }}>
              <div className="progress-fill" style={{ width: `${course.progress}%` }} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button className={`tab-item ${activeTab === 'video' ? 'active' : ''}`} onClick={() => setActiveTab('video')}>🎬 Video Lecture</button>
        <button className={`tab-item ${activeTab === 'materials' ? 'active' : ''}`} onClick={() => setActiveTab('materials')}>📚 Materials</button>
        <button className={`tab-item ${activeTab === 'quizzes' ? 'active' : ''}`} onClick={() => setActiveTab('quizzes')}>📝 Quizzes & Activities</button>
        <button className={`tab-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>💬 Course Chat</button>
      </div>

      {/* Tab Content Area */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {/* ===================== VIDEO TAB ===================== */}
          {activeTab === 'video' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="card no-hover" style={{ padding: 0, overflow: 'hidden', borderRadius: 'var(--r-lg)' }}>
                <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                  <iframe 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                    src={`https://www.youtube.com/embed/${course.videoId || 'PkZNo7MFNFg'}?rel=0`} 
                    title={course.videoTitle}
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen
                  ></iframe>
                </div>
                <div style={{ padding: '1.5rem' }}>
                  <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>{course.videoTitle}</h2>
                  <p style={{ color: 'var(--text-2)', fontSize: '0.9rem' }}>Watch the introductory lecture for this module. Make sure to complete the quizzes and activities after you're done!</p>
                </div>
              </div>

              {course.improvementAreas.length > 0 && (
                <div className="card no-hover" style={{ maxWidth: '600px' }}>
                  <div className="card-title">📊 Areas to Improve based on past performance</div>
                  <div className="improve-list">
                    {course.improvementAreas.map((a) => (
                      <div key={a.topic}>
                        <div className="improve-item-row"><span>{a.topic}</span><span className="improve-item-score">{a.score}%</span></div>
                        <div className="progress-track"><motion.div className="progress-fill" initial={{ width: 0 }} animate={{ width: `${a.score}%` }} transition={{ duration: 0.8 }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================== MATERIALS TAB ===================== */}
          {activeTab === 'materials' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
              {!course.materials || course.materials.length === 0 ? (
                <div className="card no-hover" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem' }}>
                  <p style={{ color: 'var(--text-2)' }}>No learning materials uploaded for this course yet.</p>
                </div>
              ) : (
                course.materials.map((mat, i) => {
                  const isPdf = mat.type === 'pdf';
                  const isSlides = mat.type === 'pptx' || mat.type === 'presentation';
                  const isDoc = mat.type === 'docx' || mat.type === 'xlsx';
                  let icon = '🔗';
                  let color = '#3498db';
                  if (isPdf) { icon = '📄'; color = '#e74c3c'; }
                  else if (isSlides) { icon = '📊'; color = '#f39c12'; }
                  else if (isDoc) { icon = '📝'; color = '#2ecc71'; }
                  return (
                    <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }} onClick={() => alert(`Downloading ${mat.name}... (prototype demonstration)`)}>
                      <div style={{ fontSize: '2rem', color }}>{icon}</div>
                      <div>
                        <h3 style={{ fontSize: '1rem', marginBottom: '0.2rem' }}>{mat.name}</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{mat.type.toUpperCase()} • {mat.size}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ===================== QUIZZES & ACTIVITIES TAB ===================== */}
          {activeTab === 'quizzes' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
              {/* Syllabus / Tasks */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h2 className="section-heading" style={{ fontSize: '1.25rem', marginBottom: 0 }}>Required Tasks</h2>
                <div className="card no-hover" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem' }}>
                  
                  {/* Assignment / Activity */}
                  {course.activityId && activities[course.activityId] && (
                    <div className="student-row" style={{ cursor: 'pointer', background: 'var(--bg)', border: '1px solid var(--border)' }} onClick={() => navigate(`/trainee/activity/${course.activityId}`, { state: { courseId: course.id } })}>
                      <div style={{ fontSize: '1.5rem', width: '2.5rem', height: '2.5rem', background: 'rgba(232,179,77,0.1)', color: '#e8b34d', borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>📝</div>
                      <div className="student-row-info">
                        <div className="student-row-name">{activities[course.activityId].title}</div>
                        <div className="student-row-meta">Required Activity</div>
                      </div>
                      {currentUser.activityCompletions?.includes(course.activityId) ? (
                        <span className="chip green">Done</span>
                      ) : (
                        <span className="chip" style={{ fontSize: '0.75rem' }}>Start →</span>
                      )}
                    </div>
                  )}

                  {/* Final Quiz */}
                  <div className="student-row" style={{ cursor: 'pointer', background: 'var(--bg)', border: '1px solid var(--border)' }} onClick={() => navigate(`/trainee/quiz/${course.quizId}`)}>
                    <div style={{ fontSize: '1.5rem', width: '2.5rem', height: '2.5rem', background: 'rgba(107,44,141,0.1)', color: '#6b2c8d', borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>🧠</div>
                    <div className="student-row-info">
                      <div className="student-row-name">Module Quiz</div>
                      <div className="student-row-meta">Final Assessment</div>
                    </div>
                    {quizAttempt ? (
                      <span className={`chip ${quizAttempt.score >= 70 ? 'green' : 'red'}`}>{quizAttempt.score}%</span>
                    ) : (
                      <span className="chip" style={{ fontSize: '0.75rem' }}>Take Quiz →</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Learning Journey */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h2 className="section-heading" style={{ fontSize: '1.25rem', marginBottom: 0 }}>Learning Journey</h2>
                <div className="card no-hover">
                  <JourneyMap stages={course.stages} />
                </div>
              </div>
            </div>
          )}

          {/* ===================== CHAT TAB ===================== */}
          {activeTab === 'chat' && (
            <div className="card no-hover" style={{ display: 'flex', flexDirection: 'column', height: '600px', padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>💬 Course Chat: {course.title}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>Ask questions and discuss with your trainer and peers.</p>
              </div>

              <div ref={chatScrollRef} className="chat-messages" style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-3)', marginTop: '2rem' }}>
                    <p>No messages yet.</p>
                    <p style={{ fontSize: '0.85rem' }}>Be the first to ask a question!</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMe = msg.userId === currentUser?.id;
                    return (
                      <motion.div key={msg.id} className={`chat-msg${isMe ? ' me' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                        {!isMe && <div className="avatar" style={{ width: '2rem', height: '2rem', fontSize: '0.75rem', flexShrink: 0 }}>{msg.avatar}</div>}
                        <div style={{ maxWidth: '75%' }}>
                          {!isMe && (
                            <div className="chat-sender">
                              {msg.name}
                              {msg.role === 'trainer' && <span className="chat-teacher-badge">TRAINER</span>}
                              {msg.role === 'supervisor' && <span className="chat-teacher-badge" style={{ background: 'var(--brand-primary)' }}>SUPERVISOR</span>}
                              {msg.role === 'admin' && <span className="chat-teacher-badge" style={{ background: '#dc3545' }}>ADMIN</span>}
                            </div>
                          )}
                          <div className={`chat-bubble ${isMe ? 'me' : msg.role === 'trainer' || msg.role === 'supervisor' || msg.role === 'admin' ? 'teacher' : 'other'}`}>{msg.text}</div>
                          <div className={`chat-meta`} style={{ textAlign: isMe ? 'right' : 'left' }}>{msg.time}</div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>

              <form onSubmit={handleSendChat} style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem', background: 'var(--surface-alt)' }}>
                <input
                  className="input-field"
                  style={{ flex: 1 }}
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Type a message..."
                />
                <button type="submit" className="btn btn-primary" disabled={!chatText.trim()}>Send Message</button>
              </form>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

    </div>
  );
}

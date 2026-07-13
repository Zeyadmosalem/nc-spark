import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import JourneyMap from '../../components/journey/JourneyMap';

export default function TrainerCoursePage() {
  const { courseId } = useParams();
  const { courses, currentUser, activities, quizzes, chatMessages, sendChatMessage } = useApp();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('video');
  const [chatText, setChatText] = useState('');
  const chatScrollRef = useRef(null);

  const course = courses.find((c) => c.id === courseId);
  if (!course) return <div className="page-body"><p>Course not found.</p></div>;

  // Chat logic
  const messages = chatMessages[courseId] || [];
  function handleSendChat(e) {
    e.preventDefault();
    if (!chatText.trim()) return;
    sendChatMessage(courseId, chatText.trim());
    setChatText('');
  }

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === 'chat' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainer/courses')}>← Back to Management</button>
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
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Trainer Panel • Course Hub</p>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.5rem, 4vw, 2rem)', color: '#fff', marginBottom: '0.5rem' }}>{course.title}</h1>
            <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.75)', maxWidth: '60ch' }}>{course.description}</p>
          </div>
          <div style={{ textAlign: 'right', minWidth: '150px' }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '3.2rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>{course.progress}%</div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Average Trainee Progress</div>
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
        <button className={`tab-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>💬 Discussion Board</button>
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
                  <p style={{ color: 'var(--text-2)', fontSize: '0.9rem' }}>This is the active video lecture presented to enrolled trainees. Review the content to align with your assessments.</p>
                </div>
              </div>
            </div>
          )}

          {/* ===================== MATERIALS TAB ===================== */}
          {activeTab === 'materials' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
              {!course.materials || course.materials.length === 0 ? (
                <div className="card no-hover" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem' }}>
                  <p style={{ color: 'var(--text-2)' }}>No materials uploaded by the Admin for this course yet.</p>
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
                    <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }} onClick={() => alert(`Previewing ${mat.name} as Trainer...`)}>
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
              {/* Syllabus Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h2 className="section-heading" style={{ fontSize: '1.25rem', marginBottom: 0 }}>Course Curriculum</h2>
                <div className="card no-hover" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem' }}>
                  
                  {/* Activity */}
                  {course.activityId && activities[course.activityId] && (
                    <div className="student-row" style={{ cursor: 'pointer', background: 'var(--bg)', border: '1px solid var(--border)' }} onClick={() => alert("Activity Preview (Trainer Mode)")}>
                      <div style={{ fontSize: '1.5rem', width: '2.5rem', height: '2.5rem', background: 'rgba(232,179,77,0.1)', color: '#e8b34d', borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>📝</div>
                      <div className="student-row-info">
                        <div className="student-row-name">{activities[course.activityId].title}</div>
                        <div className="student-row-meta">Required Activity</div>
                      </div>
                      <span className="chip" style={{ fontSize: '0.75rem' }}>Preview</span>
                    </div>
                  )}

                  {/* Quiz */}
                  <div className="student-row" style={{ cursor: 'pointer', background: 'var(--bg)', border: '1px solid var(--border)' }} onClick={() => alert("Quiz Preview (Trainer Mode)")}>
                    <div style={{ fontSize: '1.5rem', width: '2.5rem', height: '2.5rem', background: 'rgba(107,44,141,0.1)', color: '#6b2c8d', borderRadius: 'var(--r-md)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>🧠</div>
                    <div className="student-row-info">
                      <div className="student-row-name">Module Quiz</div>
                      <div className="student-row-meta">Final Assessment</div>
                    </div>
                    <span className="chip" style={{ fontSize: '0.75rem' }}>Preview</span>
                  </div>
                </div>
              </div>

              {/* Journey Map */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h2 className="section-heading" style={{ fontSize: '1.25rem', marginBottom: 0 }}>Journey Sequence</h2>
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
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>💬 Instructor Board: {course.title}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>Answer trainee questions, post updates, and moderate course chat.</p>
              </div>

              <div ref={chatScrollRef} className="chat-messages" style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-3)', marginTop: '2rem' }}>
                    <p>No messages yet.</p>
                    <p style={{ fontSize: '0.85rem' }}>Introduce yourself to the class!</p>
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
                  placeholder="Type a message as Trainer..."
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

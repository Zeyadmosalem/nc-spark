import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { useCourseOutline, useMyEnrollments } from '../../hooks/useCourses';
import QueryError from '../../components/shared/QueryError';

const TYPE_ICONS = {
  video: '🎬', reading: '📖', flashcards: '🃏',
  matching: '🔗', scenario: '🧭', submission: '📤', quiz: '📝',
};

export default function CoursePage() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { chatMessages, sendChatMessage } = useApp();

  const { data: course, isLoading, error } = useCourseOutline(courseId);
  const {
    data: enrollments, isLoading: loadingEnrollments, error: enrollmentsError,
  } = useMyEnrollments();

  const [activeTab, setActiveTab] = useState('path');
  const [chatText, setChatText] = useState('');
  const chatScrollRef = useRef(null);
  const messages = chatMessages[courseId] || [];

  // Every hook must run before the early returns below. This page used to
  // crash with "Rendered fewer hooks than expected" because router navigation
  // between two course ids reuses the same fiber, so returning early for an
  // unenrolled course changed the hook count between renders.
  useEffect(() => {
    if (activeTab === 'chat' && chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages.length, activeTab]);

  if (isLoading || loadingEnrollments) {
    return <div className="page-body" role="status">Loading course…</div>;
  }

  const failure = error ?? enrollmentsError;
  if (failure) {
    return <div className="page-body"><QueryError error={failure} what="this course" /></div>;
  }

  if (!course) return <div className="page-body"><p>Course not found.</p></div>;

  const enrollment = (enrollments ?? []).find((e) => e.courseId === courseId);
  const isEnrolled = enrollment?.status === 'active' || enrollment?.status === 'completed';
  const isPending = enrollment?.status === 'pending';

  if (!isEnrolled) {
    return (
      <div className="page-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainee/courses')}>
            ← Back to Courses
          </button>
        </div>
        <div className="card no-hover" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>
            {isPending ? 'Enrollment Pending' : 'Course Locked'}
          </h2>
          <p style={{ color: 'var(--text-2)', maxWidth: '40ch', margin: '0 auto 1.5rem' }}>
            {isPending
              ? 'Your request to join this course has been sent to the trainer. You will gain access once they approve it.'
              : 'You are not enrolled in this course. Please visit the Course Catalog to apply.'}
          </p>
          {!isPending && (
            <button className="btn btn-primary" onClick={() => navigate('/trainee/catalog')}>
              Go to Course Catalog
            </button>
          )}
        </div>
      </div>
    );
  }

  const accent = course.color || '#002F6C';
  const percent = enrollment.percent ?? 0;
  const modules = course.modules ?? [];

  function handleSendChat(e) {
    e.preventDefault();
    if (!chatText.trim()) return;
    sendChatMessage(courseId, chatText.trim());
    setChatText('');
  }

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/trainee/courses')}>
          ← Back to Courses
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        style={{
          borderRadius: 'var(--r-xl)', padding: '2rem', color: '#fff',
          position: 'relative', overflow: 'hidden',
          background: `linear-gradient(145deg, rgba(0,0,0,0.82), rgba(15,15,25,0.88)), linear-gradient(135deg, ${accent}88, ${accent}44)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '3rem', background: `${accent}33`, padding: '1rem', borderRadius: 'var(--r-xl)', border: `1px solid ${accent}44` }}>
            {course.icon || '📘'}
          </div>
          <div style={{ flex: 1, minWidth: 300 }}>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
              Course Hub
            </p>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.5rem, 4vw, 2rem)', color: '#fff', marginBottom: '0.5rem' }}>
              {course.title}
            </h1>
            <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.75)', maxWidth: '60ch' }}>
              {course.description}
            </p>
          </div>
          <div style={{ textAlign: 'right', minWidth: 150 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '3rem', fontWeight: 700, color: '#fff', lineHeight: 1 }}>
              {percent}%
            </div>
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Your Progress</div>
            <div className="progress-track" style={{ marginTop: '0.5rem', background: 'rgba(255,255,255,0.15)', width: '100%', maxWidth: 120, marginLeft: 'auto' }}>
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>
      </motion.div>

      <div className="tab-navigation">
        <button className={`tab-item ${activeTab === 'path' ? 'active' : ''}`} onClick={() => setActiveTab('path')}>
          📚 Learning Path
        </button>
        <button className={`tab-item ${activeTab === 'materials' ? 'active' : ''}`} onClick={() => setActiveTab('materials')}>
          📎 Materials
        </button>
        <button className={`tab-item ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
          💬 Course Chat
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
        >
          {activeTab === 'path' && (
            modules.length === 0 ? (
              <div className="card no-hover" style={{ textAlign: 'center', padding: '3rem' }}>
                <p style={{ color: 'var(--text-2)' }}>This course has no content yet.</p>
              </div>
            ) : (
              modules.map((mod) => (
                <div key={mod.id} className="card no-hover">
                  <div className="card-title">{mod.position}. {mod.title}</div>
                  {(mod.activities ?? []).length === 0 ? (
                    <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>No activities yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                      {mod.activities.map((a) => (
                        <Link
                          key={a.id}
                          to={`/trainee/activity/${a.id}`}
                          state={{ courseId }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                            textDecoration: 'none', color: 'inherit',
                            padding: '0.75rem', borderRadius: 'var(--r-md)',
                            background: 'var(--surface-alt)', border: '1px solid var(--border)',
                          }}
                        >
                          <span style={{ fontSize: '1.25rem' }}>{TYPE_ICONS[a.type] ?? '📘'}</span>
                          <span style={{ flex: 1 }}>{a.title}</span>
                          <span className="badge-pill" style={{ background: 'var(--surface)', color: 'var(--brand-primary)' }}>
                            +{a.xp} XP
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )
          )}

          {activeTab === 'materials' && (
            <div className="card no-hover" style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: 'var(--text-2)' }}>
                No learning materials uploaded for this course yet.
              </p>
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="card no-hover" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="card-title">💬 Course Discussion</div>
              <div
                ref={chatScrollRef}
                style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
              >
                {messages.length === 0 ? (
                  <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>
                    No messages yet. Start the conversation.
                  </p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} style={{ padding: '0.6rem 0.8rem', borderRadius: 'var(--r-md)', background: 'var(--surface-alt)' }}>
                      <strong style={{ fontSize: '0.8rem' }}>{m.author}</strong>
                      <div style={{ fontSize: '0.9rem' }}>{m.text}</div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  className="input-field"
                  aria-label="Message"
                  placeholder="Ask a question…"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary btn-sm" type="submit">Send</button>
              </form>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

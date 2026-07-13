import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';

export default function CourseChatDrawer({ isOpen, onClose, courseId, courseTitle }) {
  const { currentUser, chatMessages, sendChatMessage } = useApp();
  const [text, setText] = useState('');
  
  const messages = chatMessages[courseId] || [];

  function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;
    sendChatMessage(courseId, text.trim());
    setText('');
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.5)', zIndex: 999
            }}
          />

          {/* Drawer */}
          <motion.div
            className="glass-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0,
              width: '100%', maxWidth: '400px',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.1)',
              zIndex: 1000,
              display: 'flex', flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>💬 Course Chat</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{courseTitle}</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: '1.25rem', padding: '0.25rem 0.5rem' }}>✕</button>
            </div>

            {/* Messages Area */}
            <div className="chat-messages glass-alt" style={{ flex: 1, padding: '1.5rem' }}>
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
                      {!isMe && <div className="avatar" style={{ width: '1.8rem', height: '1.8rem', fontSize: '0.65rem', flexShrink: 0 }}>{msg.avatar}</div>}
                      <div>
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

            {/* Input Area */}
            <form onSubmit={handleSend} style={{ padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
              <input
                className="chat-input"
                style={{ flex: 1 }}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ask a question..."
              />
              <button type="submit" className="btn btn-primary" disabled={!text.trim()}>Send</button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

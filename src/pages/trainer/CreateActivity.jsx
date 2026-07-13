import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

export default function CreateActivity() {
  const navigate = useNavigate();
  const { addActivity } = useApp();
  const [type, setType] = useState('video');
  const [title, setTitle] = useState('');
  const [xp, setXp] = useState(10);
  
  // Specific fields
  const [videoId, setVideoId] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    addActivity({ type, title, xp, videoId, content });
    navigate('/trainer');
  };

  return (
    <div className="page-body" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
        <h1 className="section-heading" style={{ margin: 0 }}>Create New Activity</h1>
      </div>

      <form onSubmit={handleSubmit} className="card no-hover" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Activity Type</label>
          <select 
            className="chat-input" 
            style={{ width: '100%' }}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="video">Video Lesson</option>
            <option value="reading">Reading Assignment</option>
            <option value="flashcards">Flashcards</option>
            <option value="matching">Matching Game</option>
            <option value="scenario">Branching Scenario</option>
            <option value="submission">File Submission</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Title</label>
          <input 
            className="chat-input" 
            style={{ width: '100%' }} 
            placeholder="e.g. Intro to Variables"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>XP Reward</label>
          <input 
            type="number"
            className="chat-input" 
            style={{ width: '100%' }} 
            value={xp}
            onChange={(e) => setXp(e.target.value)}
            min="5" max="100"
            required
          />
        </div>

        {type === 'video' && (
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>YouTube Video ID</label>
            <input 
              className="chat-input" 
              style={{ width: '100%' }} 
              placeholder="e.g. dQw4w9WgXcQ"
              value={videoId}
              onChange={(e) => setVideoId(e.target.value)}
              required
            />
          </div>
        )}

        {type === 'reading' && (
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>Markdown Content</label>
            <textarea 
              className="chat-input" 
              style={{ width: '100%', minHeight: 200, resize: 'vertical' }} 
              placeholder="# Introduction\n\nWrite your content here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            />
          </div>
        )}

        {/* Other types would have their own specific fields here (e.g. dynamic list of flashcards) */}
        {['flashcards', 'matching', 'scenario'].includes(type) && (
          <div style={{ padding: '1rem', background: 'var(--surface-alt)', borderRadius: 'var(--r-md)', color: 'var(--text-2)' }}>
            Note: Complex activity builders (Flashcards, Matching, Scenarios) are available in the advanced editor suite.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Cancel</button>
          <button type="submit" className="btn btn-primary">Create Activity</button>
        </div>
      </form>
    </div>
  );
}

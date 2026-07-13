import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';

export default function ContentManager() {
  const { 
    courses, quizzes, activities, learningPaths, trainers,
    addCourse, updateCourse, deleteCourse, 
    addQuiz, updateQuiz, deleteQuiz,
    addActivity, updateActivity, deleteActivity 
  } = useApp();
  
  const [activeTab, setActiveTab] = useState('courses');
  const [modalType, setModalType] = useState(null); // 'course', 'quiz', 'activity'
  const [editItem, setEditItem] = useState(null);
  
  // Form states
  const [formData, setFormData] = useState({});

  function openModal(type, item = null) {
    setModalType(type);
    setEditItem(item);
    if (item) {
      setFormData(item);
    } else {
      if (type === 'course') setFormData({ title: '', description: '', icon: '📘', color: '#00a3e0', trainerId: '', totalModules: 1, videoTitle: '', quizId: '' });
      if (type === 'quiz') setFormData({ title: '', courseId: '', timeLimit: 600 });
      if (type === 'activity') setFormData({ title: '', type: 'reading', description: '', xp: 10, content: '', videoId: '' });
    }
  }

  function closeModal() {
    setModalType(null);
    setEditItem(null);
    setFormData({});
  }

  function handleSave(e) {
    e.preventDefault();
    if (modalType === 'course') {
      if (editItem) updateCourse(editItem.id, formData);
      else addCourse(formData);
    } else if (modalType === 'quiz') {
      if (editItem) updateQuiz(editItem.id, formData);
      else addQuiz(formData);
    } else if (modalType === 'activity') {
      if (editItem) updateActivity(editItem.id, formData);
      else addActivity(formData);
    }
    closeModal();
  }

  return (
    <div className="page-body">
      <p className="eyebrow">Content Management</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="section-heading" style={{ marginBottom: 0 }}>Global Curriculum</h1>
        {activeTab !== 'paths' && (
          <button className="btn btn-primary" onClick={() => openModal(activeTab.slice(0, -1) === 'activitie' ? 'activity' : activeTab.slice(0, -1).replace('quizze', 'quiz'))}>
            + Create New
          </button>
        )}
      </div>

      <div className="tab-navigation" style={{ marginBottom: '2rem' }}>
        <button className={`tab-item ${activeTab === 'courses' ? 'active' : ''}`} onClick={() => setActiveTab('courses')}>Courses</button>
        <button className={`tab-item ${activeTab === 'activities' ? 'active' : ''}`} onClick={() => setActiveTab('activities')}>Activities</button>
        <button className={`tab-item ${activeTab === 'quizzes' ? 'active' : ''}`} onClick={() => setActiveTab('quizzes')}>Quizzes</button>
        <button className={`tab-item ${activeTab === 'paths' ? 'active' : ''}`} onClick={() => setActiveTab('paths')}>Learning Paths</button>
      </div>

      <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        {activeTab === 'courses' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {courses.length === 0 && <p style={{ color: 'var(--text-2)' }}>No courses found.</p>}
            {courses.map(course => (
              <div key={course.id} className="course-card">
                <div className="course-card-header" style={{ background: `linear-gradient(145deg, ${course.color}dd, ${course.color}aa)` }}>
                  <div className="course-card-icon">{course.icon}</div>
                  <div className="course-card-title">{course.title}</div>
                  <div className="course-card-subtitle">{course.subtitle}</div>
                </div>
                <div className="course-card-body">
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', lineHeight: 1.5 }}>{course.description}</p>
                  <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-3)' }}>
                    Trainer: <strong>{course.trainerId || 'Unassigned'}</strong>
                  </div>
                </div>
                <div className="course-card-footer" style={{ display: 'flex', gap: '0.5rem', background: 'var(--surface)' }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => openModal('course', course)}>Edit Course</button>
                  <button className="btn btn-outline" style={{ flex: 1, borderColor: 'var(--brand-accent)', color: 'var(--brand-accent)' }} onClick={() => deleteCourse(course.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'activities' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {Object.values(activities || {}).map(act => (
              <div key={act.id} className="card no-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{act.type === 'video' ? '🎬' : '📖'} {act.title}</h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Type: {act.type} | XP: {act.xp}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openModal('activity', act)}>Edit</button>
                  <button className="btn btn-outline btn-sm" onClick={() => deleteActivity(act.id)} style={{ borderColor: 'var(--brand-accent)', color: 'var(--brand-accent)' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'quizzes' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {Object.values(quizzes).map(quiz => (
              <div key={quiz.id} className="card no-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>🧠 {quiz.title}</h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Course: {quiz.courseId} | {quiz.questions?.length || 0} Questions</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openModal('quiz', quiz)}>Edit</button>
                  <button className="btn btn-outline btn-sm" onClick={() => deleteQuiz(quiz.id)} style={{ borderColor: 'var(--brand-accent)', color: 'var(--brand-accent)' }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'paths' && (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {learningPaths.map(path => (
              <div key={path.id} className="card no-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{path.icon} {path.title}</h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{path.modules.length} Modules configured</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* MODALS */}
      <AnimatePresence>
        {modalType && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModal} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} />
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} style={{ position: 'fixed', top: '10vh', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg)', padding: '2rem', borderRadius: 'var(--r-xl)', zIndex: 1000, width: '90%', maxWidth: '500px', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)' }}>
              
              <h2 style={{ marginBottom: '1.5rem', fontFamily: 'var(--font-heading)' }}>{editItem ? `Edit ${modalType}` : `Create ${modalType}`}</h2>
              
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* COURSE FIELDS */}
                {modalType === 'course' && (
                  <>
                    <div><label className="input-label">Title</label><input required className="input-field" value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} /></div>
                    <div><label className="input-label">Description</label><textarea required className="input-field" style={{ minHeight: '80px' }} value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div><label className="input-label">Icon (Emoji)</label><input className="input-field" value={formData.icon || ''} onChange={e => setFormData({...formData, icon: e.target.value})} /></div>
                      <div><label className="input-label">Color (Hex)</label><input className="input-field" value={formData.color || ''} onChange={e => setFormData({...formData, color: e.target.value})} /></div>
                    </div>
                    <div>
                      <label className="input-label">Assign Trainer</label>
                      <select className="input-field" value={formData.trainerId || ''} onChange={e => setFormData({...formData, trainerId: e.target.value})}>
                        <option value="">Unassigned</option>
                        {trainers.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="input-label">Linked Quiz</label>
                      <select className="input-field" value={formData.quizId || ''} onChange={e => setFormData({...formData, quizId: e.target.value})}>
                        <option value="">None</option>
                        {Object.values(quizzes).map(q => (
                          <option key={q.id} value={q.id}>{q.title} ({q.id})</option>
                        ))}
                      </select>
                    </div>
                    
                    {/* MATERIALS MANAGEMENT SECTION */}
                    <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                      <label className="input-label">Course Materials (Demo Upload)</label>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        {(!formData.materials || formData.materials.length === 0) ? (
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', fontStyle: 'italic' }}>No materials added yet.</p>
                        ) : (
                          formData.materials.map((mat, index) => (
                            <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', background: 'var(--surface-alt)', borderRadius: 'var(--r-sm)' }}>
                              <span style={{ fontSize: '0.85rem' }}>{mat.name} <strong style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>({mat.type.toUpperCase()})</strong></span>
                              <button type="button" className="btn btn-sm btn-outline" style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem', color: '#dc3545', borderColor: '#dc3545' }} onClick={() => {
                                const updated = [...formData.materials];
                                updated.splice(index, 1);
                                setFormData({ ...formData, materials: updated });
                              }}>Remove</button>
                            </div>
                          ))
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input className="input-field" style={{ flex: 2, padding: '0.5rem' }} placeholder="Material Name" id="new-mat-name" />
                        <select className="input-field" style={{ flex: 1, padding: '0.5rem' }} id="new-mat-type">
                          <option value="pdf">PDF</option>
                          <option value="pptx">PPTX</option>
                          <option value="link">Link</option>
                        </select>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => {
                          const nameEl = document.getElementById('new-mat-name');
                          const typeEl = document.getElementById('new-mat-type');
                          if (nameEl && nameEl.value.trim()) {
                            const newMat = {
                              name: nameEl.value.trim(),
                              type: typeEl.value,
                              size: typeEl.value === 'link' ? 'Reference' : '2.5 MB'
                            };
                            setFormData({
                              ...formData,
                              materials: [...(formData.materials || []), newMat]
                            });
                            nameEl.value = '';
                          }
                        }}>Add</button>
                      </div>
                    </div>
                  </>
                )}                {/* QUIZ FIELDS */}
                {modalType === 'quiz' && (
                  <>
                    <div><label className="input-label">Quiz Title</label><input required className="input-field" value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} /></div>
                    <div><label className="input-label">Course ID</label><input required className="input-field" value={formData.courseId || ''} onChange={e => setFormData({...formData, courseId: e.target.value})} /></div>
                    <div><label className="input-label">Time Limit (Seconds)</label><input type="number" required className="input-field" value={formData.timeLimit || 600} onChange={e => setFormData({...formData, timeLimit: Number(e.target.value)})} /></div>
                  </>
                )}

                {/* ACTIVITY FIELDS */}
                {modalType === 'activity' && (
                  <>
                    <div><label className="input-label">Activity Title</label><input required className="input-field" value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} /></div>
                    <div>
                      <label className="input-label">Type</label>
                      <select className="input-field" value={formData.type || 'reading'} onChange={e => setFormData({...formData, type: e.target.value})}>
                        <option value="reading">Reading</option>
                        <option value="video">Video</option>
                        <option value="flashcards">Flashcards</option>
                      </select>
                    </div>
                    <div><label className="input-label">Description</label><textarea className="input-field" value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
                    <div><label className="input-label">XP Reward</label><input type="number" required className="input-field" value={formData.xp || 10} onChange={e => setFormData({...formData, xp: Number(e.target.value)})} /></div>
                    
                    {formData.type === 'video' && (
                      <div><label className="input-label">YouTube Video ID</label><input required className="input-field" value={formData.videoId || ''} onChange={e => setFormData({...formData, videoId: e.target.value})} /></div>
                    )}
                    {formData.type === 'reading' && (
                      <div><label className="input-label">Content (Markdown)</label><textarea className="input-field" style={{ minHeight: '120px' }} value={formData.content || ''} onChange={e => setFormData({...formData, content: e.target.value})} /></div>
                    )}
                  </>
                )}

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={closeModal} style={{ flex: 1 }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{editItem ? 'Save Changes' : 'Create'}</button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

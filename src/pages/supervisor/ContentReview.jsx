import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';

export default function ContentReview() {
  const { learningPaths, activities, showNotification } = useApp();
  const [selectedPath, setSelectedPath] = useState(null);
  
  const [modalType, setModalType] = useState(null); // 'module' | 'activity' | 'new-activity'
  const [modalData, setModalData] = useState(null);

  function closeModal() {
    setModalType(null);
    setModalData(null);
  }

  function handleSave(e) {
    e.preventDefault();
    showNotification({ type: 'success', text: `Saved changes to ${modalType}` });
    closeModal();
  }

  return (
    <div className="page-body">
      <p className="eyebrow">Curriculum Review</p>
      <h1 className="section-heading" style={{ marginBottom: '2rem' }}>Review & Edit Paths</h1>

      {!selectedPath ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {learningPaths.map(path => (
            <div key={path.id} className="card no-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{path.icon} {path.title}</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{path.description}</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setSelectedPath(path)}>Review Path Content</button>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'center' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedPath(null)}>← Back to List</button>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{selectedPath.icon} {selectedPath.title}</h2>
          </div>

          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {selectedPath.modules.map((mod, index) => (
              <div key={mod.id} className="card no-hover">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                  <h4 style={{ margin: 0 }}>Module {index + 1}: {mod.title}</h4>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setModalType('module'); setModalData(mod); }}>Edit Module Settings</button>
                </div>
                
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {mod.activities.map(actId => (
                    <div key={actId} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--surface-alt)', borderRadius: 'var(--r-md)' }}>
                      <span style={{ fontSize: '0.9rem' }}>{activities[actId] ? `[${actId}] ${activities[actId].title}` : actId}</span>
                      <button className="btn btn-outline btn-sm" onClick={() => { setModalType('activity'); setModalData(actId); }}>Edit Content</button>
                    </div>
                  ))}
                  <button 
                    className="btn btn-ghost btn-sm" 
                    style={{ marginTop: '0.5rem', alignSelf: 'flex-start', color: 'var(--brand-primary)' }}
                    onClick={() => { setModalType('new-activity'); setModalData(mod); }}
                  >
                    + Add Activity
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODALS */}
      <AnimatePresence>
        {modalType && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModal} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} />
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} style={{ position: 'fixed', top: '20vh', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg)', padding: '2rem', borderRadius: 'var(--r-xl)', zIndex: 1000, width: '90%', maxWidth: '400px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)' }}>
              
              <h2 style={{ marginBottom: '1.5rem', fontFamily: 'var(--font-heading)' }}>
                {modalType === 'module' && 'Edit Module Settings'}
                {modalType === 'activity' && `Edit Activity ${modalData}`}
                {modalType === 'new-activity' && 'Add New Activity'}
              </h2>
              
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {modalType === 'module' && (
                  <div><label className="input-label">Module Title</label><input required className="input-field" defaultValue={modalData.title} /></div>
                )}
                {modalType === 'activity' && (
                  <div><label className="input-label">Content Review Note</label><textarea required className="input-field" placeholder="Feedback or changes..." style={{ minHeight: '100px' }} /></div>
                )}
                {modalType === 'new-activity' && (
                  <div><label className="input-label">Activity ID to Attach</label><input required className="input-field" placeholder="e.g. a5" /></div>
                )}

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={closeModal} style={{ flex: 1 }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save Changes</button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

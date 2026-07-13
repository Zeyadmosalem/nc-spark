import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';

export default function UserManager() {
  const { 
    trainees, trainers, supervisors, 
    addUser, updateUser, removeUser 
  } = useApp();
  
  const [activeTab, setActiveTab] = useState('trainee');
  const [modalType, setModalType] = useState(null); // 'trainee', 'trainer', 'supervisor'
  const [editItem, setEditItem] = useState(null);
  
  // Form states
  const [formData, setFormData] = useState({});

  function openModal(type, item = null) {
    setModalType(type);
    setEditItem(item);
    if (item) {
      setFormData(item);
    } else {
      setFormData({ name: '', email: '', avatar: '' });
    }
  }

  function closeModal() {
    setModalType(null);
    setEditItem(null);
    setFormData({});
  }

  function handleSave(e) {
    e.preventDefault();
    if (editItem) updateUser(modalType, editItem.id, formData);
    else addUser(modalType, formData);
    closeModal();
  }

  const usersMap = {
    'trainee': trainees,
    'trainer': trainers,
    'supervisor': supervisors
  };
  const currentList = usersMap[activeTab] || [];

  return (
    <div className="page-body">
      <p className="eyebrow">User Management</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 className="section-heading" style={{ marginBottom: 0 }}>System Users</h1>
        <button className="btn btn-primary" onClick={() => openModal(activeTab)}>
          + Invite {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
        </button>
      </div>

      <div className="tab-navigation" style={{ marginBottom: '2rem' }}>
        <button className={`tab-item ${activeTab === 'trainee' ? 'active' : ''}`} onClick={() => setActiveTab('trainee')}>Trainees</button>
        <button className={`tab-item ${activeTab === 'trainer' ? 'active' : ''}`} onClick={() => setActiveTab('trainer')}>Trainers</button>
        <button className={`tab-item ${activeTab === 'supervisor' ? 'active' : ''}`} onClick={() => setActiveTab('supervisor')}>Supervisors</button>
      </div>

      <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ display: 'grid', gap: '1rem' }}>
          {currentList.length === 0 && <p style={{ color: 'var(--text-2)' }}>No users found.</p>}
          {currentList.map(user => (
            <div key={user.id} className="card no-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="avatar" style={{ width: '40px', height: '40px' }}>{user.avatar || '?'}</div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{user.name}</h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{user.email} | ID: {user.id}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openModal(activeTab, user)}>Edit</button>
                <button className="btn btn-outline btn-sm" onClick={() => removeUser(activeTab, user.id)} style={{ borderColor: '#dc3545', color: '#dc3545' }}>Suspend</button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* MODALS */}
      <AnimatePresence>
        {modalType && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModal} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999 }} />
            <motion.div initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }} style={{ position: 'fixed', top: '20vh', left: '50%', transform: 'translateX(-50%)', background: 'var(--bg)', padding: '2rem', borderRadius: 'var(--r-xl)', zIndex: 1000, width: '90%', maxWidth: '400px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-xl)' }}>
              
              <h2 style={{ marginBottom: '1.5rem', fontFamily: 'var(--font-heading)' }}>
                {editItem ? `Edit ${modalType.charAt(0).toUpperCase() + modalType.slice(1)}` : `Invite ${modalType.charAt(0).toUpperCase() + modalType.slice(1)}`}
              </h2>
              
              <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div><label className="input-label">Full Name</label><input required className="input-field" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
                <div><label className="input-label">Email Address</label><input type="email" required className="input-field" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} /></div>
                <div><label className="input-label">Initials (Avatar)</label><input required className="input-field" value={formData.avatar || ''} onChange={e => setFormData({...formData, avatar: e.target.value})} /></div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={closeModal} style={{ flex: 1 }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{editItem ? 'Save Changes' : 'Send Invite'}</button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { USERS } from '../data/dummyData';
import { useApp } from '../context/AppContext';

const ROLE_CARDS = [
  {
    role: 'trainee',
    label: 'Trainee',
    icon: '🎓',
    desc: 'Complete activities, earn XP, follow your learning path.',
    color: 'var(--brand-primary)',
    bgColor: 'rgba(0,47,108,0.08)',
    users: USERS.trainees,
    defaultId: 's1',
  },
  {
    role: 'trainer',
    label: 'Trainer',
    icon: '📋',
    desc: 'Create content, review submissions, guide your trainees.',
    color: 'var(--brand-secondary)',
    bgColor: 'rgba(0,62,126,0.08)',
    users: USERS.trainers,
    defaultId: 't1',
  },
  {
    role: 'supervisor',
    label: 'Supervisor',
    icon: '👁️',
    desc: 'Oversee trainers and trainees, view team reports.',
    color: 'var(--brand-accent)',
    bgColor: 'rgba(0,163,224,0.08)',
    users: USERS.supervisors,
    defaultId: 'sv1',
  },
  {
    role: 'admin',
    label: 'Admin',
    icon: '⚙️',
    desc: 'Platform-wide management and analytics.',
    color: 'var(--brand-primary)',
    bgColor: 'rgba(0,47,108,0.06)',
    users: [USERS.admin],
    defaultId: 'u0',
  },
];

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedId, setSelectedId] = useState('s1');
  const { login } = useApp();
  const navigate = useNavigate();

  function handleRoleSelect(card) {
    setSelectedRole(card.role);
    setSelectedId(card.defaultId);
  }

  function handleLogin() {
    if (!selectedRole) return;
    login(selectedRole, selectedId);
    navigate(`/${selectedRole}`);
  }

  const activeCard = ROLE_CARDS.find((c) => c.role === selectedRole);

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo">
            <div className="login-logo-mark">NC</div>
            <strong> Spark </strong>
          </div>
          <h1>Welcome to NC Spark</h1>
          <p>Choose your role to enter the learning portal.</p>
        </div>

        <div className="login-cards">
          {ROLE_CARDS.map((card) => (
            <div
              key={card.role}
              className={`login-card ${card.role}${selectedRole === card.role ? ' selected' : ''}`}
              onClick={() => handleRoleSelect(card)}
              style={{
                borderColor: selectedRole === card.role ? card.color : undefined,
                boxShadow: selectedRole === card.role ? `0 8px 30px ${card.color}33` : undefined,
              }}
            >
              <div
                className="login-card-icon"
                style={{ background: card.bgColor, fontSize: '2rem' }}
              >
                {card.icon}
              </div>
              <h2>{card.label}</h2>
              <p>{card.desc}</p>
              {selectedRole === card.role && (
                <div style={{ width: '100%', marginTop: 'auto' }}>
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.9rem',
                      borderRadius: 'var(--r-md)',
                      border: '1.5px solid var(--border)',
                      background: 'var(--surface-alt)',
                      fontSize: '0.85rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    {card.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary btn-block"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLogin();
                    }}
                  >
                    Enter as {card.label} →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

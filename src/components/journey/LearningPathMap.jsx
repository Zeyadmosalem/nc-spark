import { motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import { Link } from 'react-router-dom';

export default function LearningPathMap({ path }) {
  const { activities, quizzes, isModuleUnlocked, currentUser } = useApp();

  return (
    <div className="learning-path-map">
      <div className="path-header">
        <div className="path-icon">{path.icon}</div>
        <div className="path-info">
          <h3>{path.title}</h3>
          <p>{path.description}</p>
        </div>
      </div>

      <div className="path-modules">
        {path.modules.map((mod, index) => {
          const unlocked = isModuleUnlocked(path.id, mod.id);
          
          // Calculate module progress
          const totalActivities = mod.activities.length;
          let completedActivities = 0;
          
          const modActivities = mod.activities.map(aId => {
            const act = activities[aId];
            const quiz = quizzes[aId];
            const isQuiz = !!quiz;
            const item = act || quiz;
            
            const isCompleted = currentUser?.activityCompletions?.includes(aId) || (isQuiz && currentUser?.quizAttempts?.[aId]);
            if (isCompleted) completedActivities++;
            
            return {
              id: aId,
              title: item?.title || 'Unknown Activity',
              type: isQuiz ? 'quiz' : act?.type || 'activity',
              xp: item?.xp || (isQuiz ? 30 : 0),
              isCompleted
            };
          });
          
          const isModuleDone = totalActivities > 0 && completedActivities === totalActivities;

          return (
            <motion.div 
              key={mod.id} 
              className={`path-module ${unlocked ? 'unlocked' : 'locked'} ${isModuleDone ? 'completed' : ''}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <div className="module-timeline">
                <div className="module-node">
                  {isModuleDone ? '✓' : index + 1}
                </div>
                {index < path.modules.length - 1 && <div className="module-line" />}
              </div>
              
              <div className="module-content card no-hover">
                <div className="module-header">
                  <h4>{mod.title}</h4>
                  {unlocked ? (
                    <span className="module-status">
                      {completedActivities} / {totalActivities} completed
                    </span>
                  ) : (
                    <span className="module-status locked">
                      🔒 Locked (Complete previous module)
                    </span>
                  )}
                </div>
                
                <div className="module-activities">
                  {modActivities.map(act => (
                    <div key={act.id} className={`activity-item ${act.isCompleted ? 'completed' : ''} ${!unlocked ? 'locked' : ''}`}>
                      <div className="activity-icon">
                        {act.type === 'video' && '▶️'}
                        {act.type === 'reading' && '📖'}
                        {act.type === 'flashcards' && '🗂️'}
                        {act.type === 'matching' && '🧩'}
                        {act.type === 'scenario' && '🕵️'}
                        {act.type === 'quiz' && '📝'}
                      </div>
                      <div className="activity-details">
                        <div className="activity-title">{act.title}</div>
                        <div className="activity-meta">+{act.xp} XP</div>
                      </div>
                      
                      <div className="activity-action">
                        {act.isCompleted ? (
                          <span className="badge-pill success">Done</span>
                        ) : unlocked ? (
                          <Link to={`/trainee/activity/${act.id}`} className="btn btn-primary btn-sm">Start</Link>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

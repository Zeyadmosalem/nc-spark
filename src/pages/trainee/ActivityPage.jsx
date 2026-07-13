import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import CourseChatDrawer from '../../components/shared/CourseChatDrawer';
import ActivityWrapper from '../../components/activities/ActivityWrapper';
import VideoActivity from '../../components/activities/VideoActivity';
import ReadingActivity from '../../components/activities/ReadingActivity';
import FlashcardActivity from '../../components/activities/FlashcardActivity';
import MatchingActivity from '../../components/activities/MatchingActivity';
import ScenarioActivity from '../../components/activities/ScenarioActivity';
import FileSubmissionActivity from '../../components/activities/FileSubmissionActivity';

export default function ActivityPage() {
  const { activityId } = useParams();
  const { activities, currentUser, completeActivity } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [chatOpen, setChatOpen] = useState(false);

  const courseId = location.state?.courseId;
  const activity = activities[activityId];
  
  if (!activity) {
    return (
      <div className="page-body">
        <h2>Activity not found</h2>
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  const isCompleted = currentUser?.activityCompletions?.includes(activityId);

  function handleComplete() {
    completeActivity(activityId);
    if (courseId) navigate(`/trainee/courses/${courseId}`);
    else navigate(-1);
  }

  function handleBack() {
    if (courseId) navigate(`/trainee/courses/${courseId}`);
    else navigate(-1);
  }

  return (
    <>
      <ActivityWrapper 
        activity={activity} 
        onComplete={handleComplete} 
        onBack={handleBack}
        isCompleted={isCompleted}
      >
        {activity.type === 'video' && <VideoActivity activity={activity} />}
        {activity.type === 'reading' && <ReadingActivity activity={activity} />}
        {activity.type === 'flashcards' && <FlashcardActivity activity={activity} />}
        {activity.type === 'matching' && <MatchingActivity activity={activity} />}
        {activity.type === 'scenario' && <ScenarioActivity activity={activity} />}
        {activity.type === 'submission' && <FileSubmissionActivity activity={activity} onComplete={handleComplete} />}
      </ActivityWrapper>

      {courseId && (
        <>
          <motion.button 
            className="btn btn-primary"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setChatOpen(true)}
            style={{
              position: 'fixed', bottom: '2rem', right: '2rem',
              borderRadius: '50px', padding: '1rem 1.5rem',
              boxShadow: 'var(--shadow-lg)', zIndex: 100,
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              fontSize: '1rem', fontWeight: 600
            }}
          >
            <span style={{ fontSize: '1.25rem' }}>💬</span> Discuss
          </motion.button>

          <CourseChatDrawer 
            isOpen={chatOpen} 
            onClose={() => setChatOpen(false)} 
            courseId={courseId} 
            courseTitle="Course Discussion"
          />
        </>
      )}
    </>
  );
}

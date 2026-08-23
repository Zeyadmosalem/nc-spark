import { useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useActivity, useCompleteActivity } from '../../hooks/useActivities';
import { useSession } from '../../hooks/useSession';
import PageSkeleton from '../../components/ui/Skeleton';
import Alert from '../../components/ui/Alert';
import CourseChatDrawer from '../../components/shared/CourseChatDrawer';
import QuizActivity from '../../components/quiz/QuizActivity';
import ActivityWrapper from '../../components/activities/ActivityWrapper';
import VideoActivity from '../../components/activities/VideoActivity';
import ReadingActivity from '../../components/activities/ReadingActivity';
import FlashcardActivity from '../../components/activities/FlashcardActivity';
import MatchingActivity from '../../components/activities/MatchingActivity';
import ScenarioActivity from '../../components/activities/ScenarioActivity';
import FileSubmissionActivity from '../../components/activities/FileSubmissionActivity';

const RENDERERS = {
  video: VideoActivity,
  reading: ReadingActivity,
  flashcards: FlashcardActivity,
  matching: MatchingActivity,
  scenario: ScenarioActivity,
  submission: FileSubmissionActivity,
};

export default function ActivityPage() {
  const { activityId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const courseId = location.state?.courseId;

  const { data: activity, isLoading, error } = useActivity(activityId);
  const { profile } = useSession();
  const complete = useCompleteActivity();
  const [done, setDone] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  if (isLoading) {
    return <PageSkeleton label="Loading activity" stats={0} rows={2} />;
  }

  if (error || !activity) {
    return (
      <div className="page-body">
        <h2>Activity not found</h2>
        {error && <p style={{ color: 'var(--text-2)' }}>{error.message}</p>}
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  const Renderer = RENDERERS[activity.type];
  const back = () => (courseId ? navigate(`/trainee/courses/${courseId}`) : navigate(-1));

  // Renderers that produce evidence — a quiz score, an uploaded file — pass a
  // payload describing HOW the activity was completed. The plain "Mark as
  // Complete" button has nothing to say, so it sends an empty one.
  async function handleComplete(payload = {}) {
    try {
      await complete.mutateAsync({ activityId, payload });
      setDone(true);
      back();
    } catch {
      // The mutation holds the error; the alert below renders it.
    }
  }

  return (
    <>
      {complete.error && (
        <div className="page-body" style={{ paddingBottom: 0 }}>
          <Alert error={complete.error} />
        </div>
      )}

      {/* A quiz completes by being passed, not by a trainee saying so, which
          is why it bypasses ActivityWrapper and its "Mark as Complete"
          button. submit-quiz writes the completion row; nothing else can. */}
      {activity.type === 'quiz' ? (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div className="page-body" style={{ paddingBottom: 0 }}>
            <button className="btn btn-ghost btn-sm" onClick={back}>← Back to Path</button>
          </div>
          <QuizActivity activity={activity} />
        </div>
      ) : Renderer ? (
        <ActivityWrapper
          activity={activity}
          onComplete={() => handleComplete({})}
          onBack={back}
          isCompleted={done || complete.isPending}
        >
          {/* The submission renderer uploads straight to Storage, whose policy
              authorises on {courseId}/{traineeId}/, so it needs both ids. */}
          <Renderer
            activity={{ ...activity, courseId, traineeId: profile?.id }}
            onComplete={handleComplete}
          />
        </ActivityWrapper>
      ) : (
        <div className="page-body" style={{ maxWidth: 800, margin: '0 auto' }}>
          <button className="btn btn-ghost btn-sm" onClick={back}>← Back to Path</button>
          <div className="card no-hover" style={{ padding: '2rem', marginTop: '1rem' }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem' }}>{activity.title}</h1>
            <p style={{ color: 'var(--text-2)' }}>
              This activity type ({activity.type}) is not available yet.
            </p>
          </div>
        </div>
      )}

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
              fontSize: '1rem', fontWeight: 600,
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

import { useQuizForActivity } from '../../hooks/useQuizzes';
import QueryError from '../shared/QueryError';
import QuizRunner from './QuizRunner';
import PageSkeleton from '../ui/Skeleton';

/**
 * A quiz activity inside a module.
 *
 * Deliberately NOT wrapped in ActivityWrapper: that supplies a "Mark as
 * Complete" button, and a quiz is completed by passing it, not by saying so.
 * The completion row is written by submit-quiz on a pass and by nothing else.
 */
export default function QuizActivity({ activity }) {
  const { data: quiz, isLoading, error } = useQuizForActivity(activity?.id);

  if (isLoading) return <PageSkeleton label="Loading quiz" stats={0} rows={2} />;
  if (error) return <div className="page-body"><QueryError error={error} what="this quiz" /></div>;

  if (!quiz) {
    return (
      <div className="page-body measure">
        <div className="card no-hover u-p7 u-text-center">
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem' }}>{activity.title}</h1>
          <p className="muted-2">
            This quiz has no questions yet. Your trainer is still preparing it.
          </p>
        </div>
      </div>
    );
  }

  return <QuizRunner quiz={quiz} />;
}

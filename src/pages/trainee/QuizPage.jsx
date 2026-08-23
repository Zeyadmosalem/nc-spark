import { useParams, useNavigate } from 'react-router-dom';
import { useQuiz } from '../../hooks/useQuizzes';
import QuizRunner from '../../components/quiz/QuizRunner';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';

/**
 * The standalone quiz route. All the behaviour lives in QuizRunner, which the
 * activity page embeds too — one implementation, so a quiz cannot be graded
 * one way here and another way there.
 */
export default function QuizPage() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const { data: quiz, isLoading, error } = useQuiz(quizId);

  if (isLoading) return <PageSkeleton label="Loading quiz" stats={0} rows={2} />;

  if (error) {
    return <div className="page-body"><QueryError error={error} what="this quiz" /></div>;
  }

  if (!quiz) {
    return (
      <div className="page-body">
        <h2>Quiz not found</h2>
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>Go Back</button>
      </div>
    );
  }

  return (
    <>
      <div className="page-body" style={{ paddingBottom: 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>← Back</button>
      </div>
      <QuizRunner quiz={quiz} />
    </>
  );
}

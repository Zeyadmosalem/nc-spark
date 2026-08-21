import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

export default function TraineeQuizzesPage() {
  const { courses, quizzes, currentUser } = useApp();
  const available = Object.values(quizzes).filter((q) => courses.some((c) => c.id === q.courseId && currentUser.enrolledCourses?.includes(c.id)));
  return (
    <div className="page-body">
      <p className="eyebrow">Quizzes</p>
      <h1 className="section-heading">Available Quizzes</h1>
      <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {available.length === 0 && <div className="card no-hover">No quizzes available for your courses yet.</div>}
        {available.map((q) => (
          <div key={q.id} className="card no-hover">
            <div style={{ fontWeight: 700 }}>{q.title}</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-2)' }}>{q.questions.length} questions · {Math.round(q.passMark * 100)}% pass</div>
            <div style={{ marginTop: '0.75rem' }}>
              <Link to={`/trainee/quiz/${q.id}`} className="btn btn-primary">Start Quiz →</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

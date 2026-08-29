import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizPage from './QuizPage';

// A thin route around QuizRunner. What is worth holding is that each of the
// four states it can be in produces something a person can act on — a quiz
// that does not exist has to say so and offer a way out, rather than render an
// empty page that looks like a failure to load.

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useParams: () => ({ quizId: 'quiz-1' }),
  useNavigate: () => navigate,
}));

const quizState = { data: undefined, isLoading: false, error: null };
vi.mock('../../hooks/useQuizzes', () => ({ useQuiz: () => quizState }));

vi.mock('../../components/quiz/QuizRunner', () => ({
  default: ({ quiz }) => <div data-testid="runner">{quiz.title}</div>,
}));

beforeEach(() => {
  navigate.mockReset();
  Object.assign(quizState, { data: undefined, isLoading: false, error: null });
});

describe('while it loads', () => {
  it('shows a skeleton with a label a screen reader can hear', () => {
    quizState.isLoading = true;
    render(<QuizPage />);
    expect(screen.getByText('Loading quiz')).toBeInTheDocument();
  });
});

describe('when the quiz loads', () => {
  it('hands it to the runner, which is the single implementation', () => {
    quizState.data = { id: 'quiz-1', title: 'Fire safety check' };
    render(<QuizPage />);
    expect(screen.getByTestId('runner')).toHaveTextContent('Fire safety check');
  });

  it('offers a way back', async () => {
    quizState.data = { id: 'quiz-1', title: 'Fire safety check' };
    const user = userEvent.setup();
    render(<QuizPage />);

    await user.click(screen.getByRole('button', { name: /back/i }));
    expect(navigate).toHaveBeenCalledWith(-1);
  });
});

describe('when there is no quiz', () => {
  /**
   * An empty page is indistinguishable from a request that failed. This is the
   * same reason EmptyState and QueryError both exist.
   */
  it('says so rather than rendering nothing', () => {
    quizState.data = null;
    render(<QuizPage />);
    expect(screen.getByText('Quiz not found')).toBeInTheDocument();
  });

  it('still offers a way out', async () => {
    quizState.data = null;
    const user = userEvent.setup();
    render(<QuizPage />);

    await user.click(screen.getByRole('button', { name: /go back/i }));
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it('does not mount the runner', () => {
    quizState.data = null;
    render(<QuizPage />);
    expect(screen.queryByTestId('runner')).not.toBeInTheDocument();
  });
});

describe('when the request fails', () => {
  it('reports the failure instead of claiming the quiz is missing', () => {
    quizState.error = new Error('The server refused that');
    render(<QuizPage />);

    expect(screen.getByText(/this quiz/i)).toBeInTheDocument();
    expect(screen.queryByText('Quiz not found')).not.toBeInTheDocument();
  });
});

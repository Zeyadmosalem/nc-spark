import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import CourseChatDrawer from '../../components/shared/CourseChatDrawer';

export default function QuizPage() {
  const { quizId } = useParams();
  const { quizzes, submitQuizResultWithAnswers, requestSecondAttempt } = useApp();
  const navigate = useNavigate();
  const quiz = quizzes[quizId];

  const [phase, setPhase] = useState('intro'); // intro | question | results
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [timeLeft, setTimeLeft] = useState(quiz?.timeLimit || 600);
  const [result, setResult] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (phase === 'question') {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) { clearInterval(timerRef.current); handleFinish(); return 0; }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const question = quiz?.questions?.[currentQ];

  const totalQ = quiz?.questions?.length || 0;
  const progress = ((currentQ) / totalQ) * 100;
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');
  const isUrgent = timeLeft < 60;

  function handleAnswer(value) {
    if (answers[question.id] !== undefined && question.type !== 'paragraph') return;
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
    if (question.type !== 'paragraph') setShowExplanation(true);
  }

  function handleNext() {
    setShowExplanation(false);
    if (currentQ < totalQ - 1) {
      setCurrentQ((q) => q + 1);
    } else {
      handleFinish();
    }
  }

  function handlePrev() {
    setShowExplanation(false);
    if (currentQ > 0) setCurrentQ((q) => q - 1);
  }

  function jumpTo(index) {
    setShowExplanation(false);
    setCurrentQ(index);
    setPhase('question');
  }

  // keyboard navigation
  useEffect(() => {
    function onKey(e) {
      if (phase !== 'question') return;
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFinish() {
    clearInterval(timerRef.current);
    // Score MCQ + TF only (paragraphs are trainer-reviewed)
    const gradable = quiz.questions.filter((q) => q.type !== 'paragraph');
    let correct = 0;
    gradable.forEach((q) => {
      const ans = answers[q.id];
      if (q.type === 'mcq' && ans === q.correct) correct++;
      if (q.type === 'truefalse' && ans === q.correct) correct++;
    });
    const res = submitQuizResultWithAnswers(quizId, correct, gradable.length || 1, answers);
    setResult({ correct, gradable: gradable.length, pct: Math.round((correct / (gradable.length || 1)) * 100), ...res });
    setPhase('results');
  }

  const optionLetters = ['A', 'B', 'C', 'D'];

  if (!quiz) return <div className="page-body"><p>Quiz not found.</p></div>;

  return (
    <div className="page-body">
      <AnimatePresence mode="wait">
        {/* ===== INTRO ===== */}
        {phase === 'intro' && (
          <motion.div key="intro" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="quiz-shell">
            <div className="quiz-header">
              <div style={{ marginBottom: '0.5rem' }}><span className="chip magenta">Quiz</span></div>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: '#fff', marginBottom: '0.75rem' }}>{quiz.title}</h1>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>Read each question carefully. MCQ and True/False answers are graded instantly. Short written responses are reviewed by your trainer.</p>
            </div>
            <div className="card no-hover">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                {[
                  { icon: '❓', label: 'Questions', value: totalQ },
                  { icon: '⏱️', label: 'Time Limit', value: `${Math.floor(quiz.timeLimit / 60)} min` },
                  { icon: '🎯', label: 'Pass Mark', value: `${Math.round(quiz.passMark * 100)}%` },
                ].map((s) => (
                  <div key={s.label} style={{ textAlign: 'center', padding: '1.5rem', background: 'var(--surface-alt)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{s.icon}</div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--heading)' }}>{s.value}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(107,44,141,0.07)', border: '1px solid rgba(107,44,141,0.15)', borderRadius: 'var(--r-lg)', padding: '1rem 1.25rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: 'var(--text-2)' }}>
                💡 Earning <strong>+30 XP</strong> for a passing score. Paragraphs are marked "Pending" until your trainer reviews them.
              </div>
              <button className="btn btn-primary btn-lg btn-block" onClick={() => { setTimeLeft(quiz.timeLimit); setPhase('question'); }}>
                🚀 Start Quiz
              </button>
            </div>
          </motion.div>
        )}

        {/* ===== QUESTION ===== */}
        {phase === 'question' && (
          <motion.div key={`q-${currentQ}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }} className="quiz-shell">
            {/* Header bar */}
            <div className="quiz-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>{quiz.title}</span>
                <div className={`quiz-timer ${isUrgent ? 'urgent' : ''}`}>
                  <span>{isUrgent ? '⚠️' : '⏱️'}</span>
                  <span>{mins}:{secs}</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', marginBottom: '0.5rem' }}>
                <span>Question {currentQ + 1} of {totalQ}</span>
                <span>{Math.round(progress)}% done</span>
              </div>
              <div style={{ height: 6, borderRadius: 'var(--r-pill)', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                <motion.div style={{ height: '100%', background: 'linear-gradient(90deg, #6b2c8d, #cc3366)', borderRadius: 'inherit' }} animate={{ width: `${((currentQ + 1) / totalQ) * 100}%` }} transition={{ duration: 0.4 }} />
              </div>
            </div>

            {/* Question Card */}
            <div className="question-card">
              <div className="question-number">Question {currentQ + 1} · {question.type === 'mcq' ? 'Multiple Choice' : question.type === 'truefalse' ? 'True / False' : 'Short Answer'}</div>
              <div className="question-prompt">{question.prompt}</div>

              {question.type === 'mcq' && (
                <div className="mcq-options">
                  {question.options.map((opt, i) => {
                    const selected = answers[question.id] === i;
                    const isCorrect = showExplanation && i === question.correct;
                    const isWrong = showExplanation && selected && i !== question.correct;
                    return (
                      <motion.button
                        key={i}
                        className={`mcq-option ${selected ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrong ? 'incorrect' : ''}`}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleAnswer(i)}
                        disabled={showExplanation}
                      >
                        <span className="mcq-option-letter">{optionLetters[i]}</span>
                        {opt}
                        {isCorrect && <span style={{ marginLeft: 'auto' }}>✓</span>}
                        {isWrong && <span style={{ marginLeft: 'auto' }}>✗</span>}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {question.type === 'truefalse' && (
                <div className="tf-options">
                  {[true, false].map((val) => {
                    const selected = answers[question.id] === val;
                    const isCorrect = showExplanation && val === question.correct;
                    const isWrong = showExplanation && selected && val !== question.correct;
                    return (
                      <motion.button
                        key={String(val)}
                        className={`tf-option ${selected ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrong ? 'incorrect' : ''}`}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => handleAnswer(val)}
                        disabled={showExplanation}
                      >
                        <div className="tf-icon">{val ? '✅' : '❌'}</div>
                        <div>{val ? 'True' : 'False'}</div>
                        {isCorrect && <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Correct!</div>}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {question.type === 'paragraph' && (
                <div className="paragraph-field">
                  <textarea
                    value={answers[question.id] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
                    placeholder="Write your response here..."
                  />
                  <div className="paragraph-guidance">
                    <span>📝</span>
                    <span>{question.guidance}</span>
                  </div>
                </div>
              )}

              {/* Explanation box */}
              <AnimatePresence>
                {showExplanation && question.explanation && (
                  <motion.div className="explanation-box" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <strong>💡 Explanation</strong>
                    {question.explanation}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Navigation */}
            <div className="quiz-footer">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button className="btn btn-ghost" onClick={() => navigate(`/trainee/courses/${quiz.courseId}`)}>← Exit Quiz</button>
                <button className="btn btn-secondary" onClick={handlePrev} disabled={currentQ === 0}>← Prev</button>
                <button
                  className="btn btn-primary"
                  onClick={handleNext}
                  disabled={question.type !== 'paragraph' && answers[question.id] === undefined}
                >
                  {currentQ < totalQ - 1 ? 'Next →' : '🏁 Finish'}
                </button>
              </div>

              <div className="question-dots" aria-hidden>
                {quiz.questions.map((_, i) => (
                  <button key={i} className={`question-dot ${i === currentQ ? 'active' : ''} ${answers[quiz.questions[i].id] !== undefined ? 'answered' : ''}`} onClick={() => jumpTo(i)} title={`Go to question ${i+1}`} />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ===== RESULTS ===== */}
        {phase === 'results' && result && (
          <motion.div key="results" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200 }} className="quiz-shell">
            <div className="results-hero" style={{ '--score-pct': `${result.pct * 3.6}deg` }}>
              <motion.div
                className="score-ring"
                initial={{ rotate: -90 }}
                animate={{ rotate: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                <div className="score-ring-inner">
                  <div className="score-ring-value">{result.pct}%</div>
                </div>
              </motion.div>
              <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', color: '#fff', marginBottom: '0.5rem' }}>
                {result.passed ? '🎉 Congratulations!' : '📚 Keep Studying!'}
              </motion.h2>
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} style={{ color: 'rgba(255,255,255,0.75)', marginBottom: '1.5rem' }}>
                {result.passed ? `You passed with ${result.pct}% — excellent work!` : `You scored ${result.pct}%. The pass mark is ${Math.round(quizzes[quizId].passMark * 100)}%.`}
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} style={{ display: 'flex', gap: '2rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700 }}>{result.correct}/{result.gradable}</div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>Correct Answers</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700, color: '#e8b34d' }}>+{result.xpGained}</div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>XP Earned</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 700 }}>
                    {quiz.questions.filter((q) => q.type === 'paragraph').length}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>Pending Review</div>
                </div>
              </motion.div>
            </div>

            <div className="card no-hover">
              {!result.passed && (
                <div style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', background: 'rgba(220,53,69,0.06)', border: '1px solid rgba(220,53,69,0.15)', borderRadius: 'var(--r-lg)', fontSize: '0.875rem', color: 'var(--text-2)' }}>
                  💬 Want a second attempt? You can request one from your trainer. They'll review and approve it for you.
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => navigate(`/trainee/courses/${quiz.courseId}`)}>← Back to Course</button>
                {!result.passed && (
                  <button className="btn btn-secondary" onClick={() => {
                    const courseId = quiz.courseId;
                    requestSecondAttempt(quizId);
                    navigate(`/trainee/courses/${courseId}`);
                  }}>
                    🔁 Request Second Attempt
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
        courseId={quiz.courseId} 
        courseTitle="Course Discussion"
      />
    </div>
  );
}

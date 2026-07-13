import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

export default function QuizPreview() {
  const location = useLocation();
  const { state } = location;
  const navigate = useNavigate();
  let quiz = state?.quiz;
  // support deep-link via ?q=<base64(json)> or ?q=<encodedURIComponent(json)>
  if (!quiz) {
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q) {
      try {
        // try base64
        const decoded = JSON.parse(atob(q));
        quiz = decoded;
      } catch (_e1) {
        try {
          const decoded2 = JSON.parse(decodeURIComponent(q));
          quiz = decoded2;
        } catch (_e2) {
          // ignore
        }
      }
    }
  }
  const [phase, setPhase] = useState('intro');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showExplanation, setShowExplanation] = useState(false);
  const [timeLeft, setTimeLeft] = useState(quiz?.timeLimit || 600);
  const [result, setResult] = useState(null);
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

  if (!quiz) return <div className="page-body"><p>No quiz data provided for preview.</p></div>;

  const question = quiz.questions[currentQ];
  const totalQ = quiz.questions.length;
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');

  function handleAnswer(value) {
    if (answers[question.id] !== undefined && question.type !== 'paragraph') return;
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
    if (question.type !== 'paragraph') setShowExplanation(true);
  }

  function handleNext() {
    setShowExplanation(false);
    if (currentQ < totalQ - 1) setCurrentQ((q) => q + 1);
    else handleFinish();
  }

  function handlePrev() { setShowExplanation(false); if (currentQ > 0) setCurrentQ((q) => q - 1); }

  function handleFinish() {
    clearInterval(timerRef.current);
    const gradable = quiz.questions.filter((q) => q.type !== 'paragraph');
    let correct = 0;
    gradable.forEach((q) => {
      const ans = answers[q.id];
      if (q.type === 'mcq' && ans === q.correct) correct++;
      if (q.type === 'truefalse' && ans === q.correct) correct++;
    });
    setResult({ correct, gradable: gradable.length, pct: Math.round((correct / (gradable.length || 1)) * 100) });
    setPhase('results');
  }

  const optionLetters = ['A', 'B', 'C', 'D'];

  return (
    <div className="page-body">
      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <motion.div key="intro" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="quiz-shell">
            <div className="quiz-header">
              <div style={{ marginBottom: '0.5rem' }}><span className="chip magenta">Preview</span></div>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', color: '#fff', marginBottom: '0.75rem' }}>{quiz.title}</h1>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem' }}>This is a preview. Results shown are local only and won't be saved.</p>
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
              <button className="btn btn-primary btn-lg btn-block" onClick={() => { setTimeLeft(quiz.timeLimit); setPhase('question'); }}>
                🚀 Start Preview
              </button>
            </div>
          </motion.div>
        )}

        {phase === 'question' && (
          <motion.div key={`q-${currentQ}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }} className="quiz-shell">
            <div className="quiz-header">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)' }}>{quiz.title}</span>
                <div className={`quiz-timer`}>
                  <span>⏱️</span>
                  <span>{mins}:{secs}</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'rgba(255,255,255,0.65)', marginBottom: '0.5rem' }}>
                <span>Question {currentQ + 1} of {totalQ}</span>
                <span>{Math.round(((currentQ) / totalQ) * 100)}% done</span>
              </div>
              <div style={{ height: 6, borderRadius: 'var(--r-pill)', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
                <motion.div style={{ height: '100%', background: 'linear-gradient(90deg, #6b2c8d, #cc3366)', borderRadius: 'inherit' }} animate={{ width: `${((currentQ + 1) / totalQ) * 100}%` }} transition={{ duration: 0.4 }} />
              </div>
            </div>

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

              <AnimatePresence>
                {showExplanation && question.explanation && (
                  <motion.div className="explanation-box" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <strong>💡 Explanation</strong>
                    {question.explanation}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="quiz-footer">
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button className="btn btn-ghost" onClick={() => navigate(-1)}>← Exit Preview</button>
                <button className="btn btn-secondary" onClick={handlePrev} disabled={currentQ === 0}>← Prev</button>
                <button
                  className="btn btn-primary"
                  onClick={handleNext}
                  disabled={question.type !== 'paragraph' && answers[question.id] === undefined}
                >
                  {currentQ < totalQ - 1 ? 'Next →' : '🏁 Finish Preview'}
                </button>
              </div>

              <div className="question-dots" aria-hidden>
                {quiz.questions.map((_, i) => (
                  <button key={i} className={`question-dot ${i === currentQ ? 'active' : ''} ${answers[quiz.questions[i].id] !== undefined ? 'answered' : ''}`} onClick={() => { setCurrentQ(i); setPhase('question'); }} title={`Go to question ${i+1}`} />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'results' && result && (
          <motion.div key="results" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 200 }} className="quiz-shell">
            <div className="results-hero">
              <div className="score-ring-inner">
                <div className="score-ring-value">{result.pct}%</div>
              </div>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', color: '#fff', marginBottom: '0.5rem' }}>
                Preview Results
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.75)', marginBottom: '1.5rem' }}>This preview does not save results — it's only for demonstration.</p>
            </div>

            <div className="card no-hover">
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => navigate('/student')}>← Back to Dashboard</button>
                <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Back</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

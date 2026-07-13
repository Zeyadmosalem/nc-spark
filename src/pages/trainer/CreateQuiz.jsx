import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

export default function CreateQuiz() {
  const { currentUser, courses, createQuiz, assignQuizToCourse } = useApp();
  const myCourses = courses.filter((c) => c.trainerId === currentUser.id);
  const [courseId, setCourseId] = useState(myCourses?.[0]?.id || '');
  const [title, setTitle] = useState('New Quiz');
  const [timeLimit, setTimeLimit] = useState(10);
  const [passMark, setPassMark] = useState(0.7);
  const [questions, setQuestions] = useState([]);
  const navigate = useNavigate();

  function addQuestion(type) {
    setQuestions((prev) => [...prev, { id: `q_${Date.now()}`, type, prompt: '', options: type === 'mcq' ? ['', '', '', ''] : [], correct: type === 'mcq' ? 0 : type === 'truefalse' ? true : null, guidance: '' }]);
  }

  function updateQuestion(idx, changes) {
    setQuestions((prev) => prev.map((q, i) => i === idx ? { ...q, ...changes } : q));
  }

  function removeQuestion(idx) { setQuestions((prev) => prev.filter((_, i) => i !== idx)); }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      title,
      courseId,
      timeLimit: Number(timeLimit) * 60,
      passMark: Number(passMark),
      questions: questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options, correct: q.correct, guidance: q.guidance })),
    };
    const id = createQuiz(payload);
    assignQuizToCourse(courseId, id);
    navigate('/trainer');
  }

  function handlePreview(e) {
    e.preventDefault();
    const payload = {
      id: `preview_${Date.now()}`,
      title,
      courseId,
      timeLimit: Number(timeLimit) * 60,
      passMark: Number(passMark),
      questions: questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options, correct: q.correct, guidance: q.guidance })),
    };
    navigate('/trainee/quiz/preview', { state: { quiz: payload } });
  }

  function exportJSON() {
    const payload = {
      id: `preview_${Date.now()}`,
      title,
      courseId,
      timeLimit: Number(timeLimit) * 60,
      passMark: Number(passMark),
      questions: questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options, correct: q.correct, guidance: q.guidance })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_quiz.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function copyDeepLink() {
    const payload = {
      id: `preview_${Date.now()}`,
      title,
      courseId,
      timeLimit: Number(timeLimit) * 60,
      passMark: Number(passMark),
      questions: questions.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options, correct: q.correct, guidance: q.guidance })),
    };
    try {
      const base = btoa(JSON.stringify(payload));
      const link = `${window.location.origin}/trainee/quiz/preview?q=${base}`;
      navigator.clipboard.writeText(link);
      alert('Preview link copied to clipboard');
    } catch (e) {
      alert('Unable to copy link in this environment.');
    }
  }

  return (
    <div className="page-body">
      <p className="eyebrow">Create Quiz</p>
      <h1 className="section-heading">Author a New Quiz</h1>

      <form onSubmit={handleSubmit} className="create-quiz-form">
        <div className="card">
          <div className="card-title">Quiz Details</div>
          <div className="form-row">
            <div className="form-field">
              <label className="form-label">Course</label>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                {myCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ flex: 2 }}>
              <label className="form-label">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quiz title" />
            </div>
            <div className="form-field">
              <label className="form-label">Time (min)</label>
              <input type="number" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} min={1} />
            </div>
            <div className="form-field">
              <label className="form-label">Pass Mark</label>
              <input type="number" value={passMark} onChange={(e) => setPassMark(e.target.value)} step={0.01} min={0} max={1} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Questions</div>
          <div className="form-row" style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => addQuestion('mcq')}>Add MCQ</button>
              <button type="button" className="btn btn-secondary" onClick={() => addQuestion('truefalse')}>Add True/False</button>
              <button type="button" className="btn btn-secondary" onClick={() => addQuestion('paragraph')}>Add Short Answer</button>
            </div>
            <div style={{ marginLeft: 'auto', alignSelf: 'center', color: 'var(--text-2)', fontSize: '0.9rem' }}>{questions.length} question(s)</div>
          </div>

          <div className="question-list">
            {questions.length === 0 && <div className="small-note">No questions yet — use the buttons above to add one.</div>}
            {questions.map((q, idx) => (
              <div key={q.id} className="question-editor">
                <div className="question-editor-header">
                  <div><strong>{idx + 1}. {q.type.toUpperCase()}</strong></div>
                  <div>
                    <button type="button" className="btn btn-ghost" onClick={() => removeQuestion(idx)}>Remove</button>
                  </div>
                </div>
                <div className="form-field">
                  <label className="form-label">Prompt</label>
                  <input value={q.prompt} onChange={(e) => updateQuestion(idx, { prompt: e.target.value })} placeholder="Question prompt" />
                </div>
                {q.type === 'mcq' && (
                  <div className="options-grid">
                    {q.options.map((opt, i) => (
                      <div key={i} className="form-field option-field">
                        <label className="form-label">Option {i+1}</label>
                        <input value={opt} onChange={(e) => updateQuestion(idx, { options: q.options.map((o,j) => j===i?e.target.value:o) })} placeholder={`Option ${i+1}`} />
                      </div>
                    ))}
                    <div className="form-field" style={{ minWidth: 160 }}>
                      <label className="form-label">Correct</label>
                      <select value={q.correct} onChange={(e) => updateQuestion(idx, { correct: Number(e.target.value) })}>
                        {q.options.map((_, i) => <option key={i} value={i}>{i+1}</option>)}
                      </select>
                    </div>
                  </div>
                )}
                {q.type === 'truefalse' && (
                  <div className="form-row">
                    <label className="form-label">Correct Answer</label>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                      <label><input type="radio" name={`tf_${q.id}`} checked={q.correct === true} onChange={() => updateQuestion(idx, { correct: true })} /> True</label>
                      <label><input type="radio" name={`tf_${q.id}`} checked={q.correct === false} onChange={() => updateQuestion(idx, { correct: false })} /> False</label>
                    </div>
                  </div>
                )}
                {q.type === 'paragraph' && (
                  <div className="form-field">
                    <label className="form-label">Guidance</label>
                    <input value={q.guidance} onChange={(e) => updateQuestion(idx, { guidance: e.target.value })} placeholder="Guidance for response" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button className="btn btn-outline" onClick={handlePreview} type="button">Preview Quiz</button>
          <button className="btn btn-outline" onClick={copyDeepLink} type="button">Copy Preview Link</button>
          <button className="btn btn-ghost" onClick={exportJSON} type="button">Export JSON</button>
          <button className="btn btn-primary" type="submit">Create Quiz</button>
        </div>
      </form>
    </div>
  );
}

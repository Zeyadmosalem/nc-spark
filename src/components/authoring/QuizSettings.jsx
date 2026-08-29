import { useState } from 'react';
import Alert from '../ui/Alert';
import { useToast } from '../ui/toast-context';
import { useSaveQuiz } from '../../hooks/useAuthoring';
export default function QuizSettings({ quiz, activityId, courseId }) {
  const { notify } = useToast();
  const save = useSaveQuiz();
  const [title, setTitle] = useState(quiz.title);
  const [pass, setPass] = useState(String(Math.round(Number(quiz.pass_mark) * 100)));
  // Stored in seconds, entered in minutes — nobody sets a quiz to 900 seconds.
  const [minutes, setMinutes] = useState(
    quiz.time_limit_seconds ? String(Math.round(quiz.time_limit_seconds / 60)) : '');

  const passNum = Number(pass);
  const badPass = pass.trim() === '' || Number.isNaN(passNum) || passNum < 1 || passNum > 100;
  const minsNum = Number(minutes);
  const badMinutes = minutes.trim() !== '' && (Number.isNaN(minsNum) || minsNum < 1);

  const dirty = title !== quiz.title
    || passNum !== Math.round(Number(quiz.pass_mark) * 100)
    || (minutes.trim() === '' ? quiz.time_limit_seconds !== null
      : minsNum * 60 !== quiz.time_limit_seconds);

  return (
    <div className="card no-hover cluster">
      <div className="grow-field">
        <label className="input-label" htmlFor="quiz-title">Quiz title</label>
        <input id="quiz-title" className="input-field" value={title}
               onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field-sm">
        <label className="input-label" htmlFor="quiz-pass">Pass mark %</label>
        <input id="quiz-pass" className="input-field" inputMode="numeric" value={pass}
               onChange={(e) => setPass(e.target.value)} />
      </div>
      <div style={{ width: 130 }}>
        <label className="input-label" htmlFor="quiz-time">Time limit (min)</label>
        <input id="quiz-time" className="input-field" inputMode="numeric" placeholder="none"
               value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </div>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={save.isPending || !dirty || !title.trim() || badPass || badMinutes}
        onClick={() => save.mutate(
          {
            quizId: quiz.id, activityId, courseId,
            title: title.trim(),
            passMark: passNum / 100,
            timeLimitSeconds: minutes.trim() === '' ? null : minsNum * 60,
          },
          { onSuccess: () => notify('Quiz settings saved.') },
        )}
      >
        {save.isPending ? 'Saving…' : 'Save settings'}
      </button>
      <div style={{ flexBasis: '100%' }}>
        <p className="text-xs muted m-0">
          Leave the time limit empty for no limit. The pass mark is measured
          against the total points below, not the number of questions.
        </p>
        <Alert error={save.error} />
      </div>
    </div>
  );
}

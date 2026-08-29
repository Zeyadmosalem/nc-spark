import { useState } from 'react';
import { useMyEnrollments, useCourses } from '../../hooks/useCourses';
import { useCreateSupportRequest } from '../../hooks/useSupport';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Alert from '../ui/Alert';
import { useToast } from '../ui/toast-context';
export default function NewRequestForm({ onDone }) {
  const { notify } = useToast();
  const create = useCreateSupportRequest();
  const enrollments = useMyEnrollments();
  const courses = useCourses();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [courseId, setCourseId] = useState('');

  const byId = new Map((courses.data ?? []).map((c) => [c.id, c]));
  const mine = (enrollments.data ?? [])
    .filter((e) => e.status === 'active' || e.status === 'completed')
    .map((e) => byId.get(e.courseId))
    .filter(Boolean);

  const problem = !subject.trim()
    ? 'Give it a subject, so whoever picks it up knows what it is about.'
    : !body.trim()
      ? 'Describe what is happening.'
      : null;

  function submit(e) {
    e.preventDefault();
    if (problem) return;
    create.mutate({ subject, body, courseId: courseId || null }, {
      onSuccess: (thread) => {
        notify('Sent. The reply arrives here.');
        onDone(thread?.id);
      },
    });
  }

  return (
    <form onSubmit={submit} className="card no-hover stack-md">
      <h2 className="card-title"><Icon name="support" size={16} />Ask for help</h2>

      <div className="field">
        <label className="input-label" htmlFor="support-subject">Subject</label>
        <input
          id="support-subject" className="input-field" maxLength={200} autoFocus
          placeholder="Module 2 will not open"
          value={subject} onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      {/* A course is context for the administrator, not a routing choice. */}
      <div className="field">
        <label className="input-label" htmlFor="support-course">Which course? (optional)</label>
        <select
          id="support-course" className="input-field" value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          aria-describedby="support-course-hint"
        >
          <option value="">Not about a course — send to an administrator</option>
          {mine.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <p id="support-course-hint" className="input-hint">
          This adds course context for an administrator. All support requests
          are answered by the admin team.
        </p>
      </div>

      <div className="field">
        <label className="input-label" htmlFor="support-body">What is happening?</label>
        <textarea
          id="support-body" className="input-field" rows={6} maxLength={4000}
          placeholder="I finished everything in module 1 but the next one is still locked."
          value={body} onChange={(e) => setBody(e.target.value)}
        />
      </div>

      {problem && <p className="input-hint input-hint-warn">{problem}</p>}
      <Alert error={create.error} />

      <div className="cluster">
        <Button type="submit" variant="primary" pending={create.isPending} disabled={Boolean(problem)}>
          Send
        </Button>
        <Button variant="ghost" onClick={() => onDone(null)}>Cancel</Button>
      </div>
    </form>
  );
}

import { FlashcardsEditor, MatchingEditor, ScenarioEditor } from './StructuredEditors';
/**
 * Whatever the chosen type needs beyond a title.
 *
 * The structured editors hand back a whole array (`{cards: [...]}`), and the
 * single-field ones hand back one key. Both are merged into the existing
 * content by the caller, so a type that keeps a stale key from a previous
 * choice is prevented by resetting content on the type picker rather than
 * here.
 *
 * @param idPrefix  keeps input ids unique. Two of these render at once — the
 *                  add form and any open activity row — and duplicate ids
 *                  point every label at the first field of that name.
 */
export default function ContentFields({ type, content, onChange, idPrefix }) {
  if (type === 'reading') {
    return (
      <div>
        <label className="input-label" htmlFor={`${idPrefix}-body`}>Text</label>
        <textarea
          id={`${idPrefix}-body`} rows={6} className="input-field"
          value={content.body ?? ''}
          onChange={(e) => onChange({ body: e.target.value })}
        />
      </div>
    );
  }
  if (type === 'video') {
    return (
      <div>
        <label className="input-label" htmlFor={`${idPrefix}-video`}>YouTube video ID</label>
        <input
          id={`${idPrefix}-video`} className="input-field" placeholder="dQw4w9WgXcQ"
          value={content.videoId ?? ''}
          onChange={(e) => onChange({ videoId: e.target.value })}
        />
        <p className="input-hint mt-xs">
          The id only, not the whole URL — the part after <code className="inline-code">v=</code>.
        </p>
      </div>
    );
  }
  if (type === 'submission') {
    return (
      <p className="text-sm muted-2 m-0">
        Trainees upload a file here and a trainer reviews it. Nothing else to set up.
      </p>
    );
  }
  if (type === 'flashcards') {
    return <FlashcardsEditor content={content} onChange={onChange} idPrefix={idPrefix} />;
  }
  if (type === 'matching') {
    return <MatchingEditor content={content} onChange={onChange} idPrefix={idPrefix} />;
  }
  if (type === 'scenario') {
    return <ScenarioEditor content={content} onChange={onChange} idPrefix={idPrefix} />;
  }
  // quiz. The questions are edited from the saved activity, in ActivityRow:
  // a quiz hangs off an activity_id, so there is nothing to attach one to
  // until the activity exists.
  return (
    <p className="text-sm muted-2 m-0">
      Add the activity first, then open it to write the questions.
    </p>
  );
}

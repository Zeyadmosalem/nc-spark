import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMyLibrary } from '../../hooks/useLibrary';
import QueryError from '../../components/shared/QueryError';
import PageSkeleton from '../../components/ui/Skeleton';
import EmptyState from '../../components/ui/EmptyState';
import PageHeader from '../../components/ui/PageHeader';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { stagger, item, SPRING_SOFT } from '../../lib/motion';

/**
 * Everything the trainee can open, across every course they are on.
 *
 * The prototype had two screens for this — a quiz list and a video library —
 * and both went with the prototype store, because both read invented data.
 * Their purpose was real and had no replacement: somebody taking four courses
 * had no way to answer "what videos are there" or "which quizzes are left"
 * without opening each course and scrolling its modules. The old routes now
 * land here with that filter already chosen, so the two screens are one
 * implementation and neither link is broken.
 *
 * Every row goes to the ordinary activity page. A library that played a video
 * in place would be a video that records no completion, which is a worse
 * outcome than an extra click: the trainee would watch it and stay stuck.
 */

const KINDS = {
  all: { label: 'Everything', icon: 'library', match: () => true },
  video: { label: 'Videos', icon: 'video', match: (a) => a.type === 'video' },
  quiz: { label: 'Quizzes', icon: 'quiz', match: (a) => a.type === 'quiz' },
  reading: { label: 'Reading', icon: 'reading', match: (a) => a.type === 'reading' },
  practice: {
    label: 'Practice',
    icon: 'flashcards',
    match: (a) => ['flashcards', 'matching', 'scenario'].includes(a.type),
  },
  submission: { label: 'Hand-ins', icon: 'submission', match: (a) => a.type === 'submission' },
};

/** The old /trainee/quizzes and /trainee/videos routes arrive with this set. */
export default function LibraryPage({ initialKind = 'all' }) {
  const { data, isLoading, error } = useMyLibrary();
  const [kind, setKind] = useState(KINDS[initialKind] ? initialKind : 'all');
  const [hideDone, setHideDone] = useState(false);

  if (isLoading) return <PageSkeleton label="Loading your library" stats={0} rows={5} />;
  if (error) {
    return (
      <div className="page-body">
        <QueryError error={error} what="your library" />
      </div>
    );
  }

  const everything = data ?? [];
  const inKind = everything.filter(KINDS[kind].match);
  const shown = hideDone ? inKind.filter((a) => !a.completed) : inKind;
  const doneInKind = inKind.filter((a) => a.completed).length;

  // Grouped by course, because "which quizzes are left" is nearly always asked
  // about one course at a time even when the list spans several.
  const byCourse = new Map();
  for (const entry of shown) {
    if (!byCourse.has(entry.courseId)) byCourse.set(entry.courseId, []);
    byCourse.get(entry.courseId).push(entry);
  }

  const remaining = everything.filter((a) => !a.completed && a.unlocked).length;

  return (
    <div className="page-body">
      <PageHeader
        eyebrow="Library"
        icon="library"
        title="Everything on your courses"
        subtitle={
          everything.length === 0
            ? 'Every activity across every course you are enrolled on, in one list.'
            : `${everything.length} activities in total, ${remaining} open and unfinished.`
        }
      />

      {everything.length === 0 ? (
        <EmptyState
          icon="library"
          title="Nothing here yet"
          action={<Button to="/trainee/catalog" variant="primary" icon="catalog">Browse the catalog</Button>}
        >
          You are not enrolled on a course with any content in it.
        </EmptyState>
      ) : (
        <>
          <div className="cluster u-between">
            <div className="segmented" role="group" aria-label="Filter by kind">
              {Object.entries(KINDS).map(([value, { label, icon }]) => {
                const count = everything.filter(KINDS[value].match).length;
                const selected = kind === value;
                return (
                  <button
                    key={value}
                    type="button"
                    className="segment"
                    aria-pressed={selected}
                    onClick={() => setKind(value)}
                  >
                    {/*
                      One shared element behind whichever segment is active, so
                      the highlight slides across the group. Two backgrounds
                      cross-fading reads as a flicker at this size.
                    */}
                    {selected && (
                      <motion.span
                        layoutId="library-filter"
                        className="segment-indicator"
                        transition={SPRING_SOFT}
                      />
                    )}
                    <span className="segment-content">
                      <Icon name={icon} size={14} />
                      {label}
                      {/*
                        An explicit space. JSX drops the whitespace between an
                        expression and the element on the next line, so the
                        accessible name came out as "Videos2".
                      */}
                      {' '}
                      <span className="segment-count">{count}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {doneInKind > 0 && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={hideDone}
                  onChange={(e) => setHideDone(e.target.checked)}
                />
                Hide the {doneInKind} I have finished
              </label>
            )}
          </div>

          {shown.length === 0 ? (
            <EmptyState
              icon={hideDone ? 'complete' : 'empty'}
              title={hideDone ? 'All done' : 'Nothing of that kind'}
            >
              {hideDone
                ? `You have finished every ${KINDS[kind].label.toLowerCase()} item on your courses.`
                : `None of your courses has ${KINDS[kind].label.toLowerCase()} in it yet.`}
            </EmptyState>
          ) : (
            /*
              Keyed on the filter, so changing it remounts the list and the
              new rows stagger in. Deliberately NOT wrapped in AnimatePresence:
              an exit animation on a filter means the list empties, waits, then
              refills — a third of a second of blank space every time somebody
              narrows a list, which is exactly when they are least patient.
            */
              <motion.div
                key={`${kind}-${hideDone}`}
                className="stack-lg"
                variants={stagger(0.03)}
                initial="hidden"
                animate="visible"
              >
                {[...byCourse.entries()].map(([courseId, items]) => (
                  <motion.section key={courseId} variants={item}>
                    <h2 className="group-title">
                      <span aria-hidden="true">{items[0].courseIcon ?? '\u{1F4D8}'}</span>
                      <Link to={`/trainee/courses/${courseId}`}>{items[0].courseTitle}</Link>
                      <span className="group-count">
                        {items.filter((a) => a.completed).length} of {items.length} done
                      </span>
                    </h2>
                    <motion.div className="stack" variants={stagger(0.025)}>
                      {items.map((entry) => <Row key={entry.id} item={entry} />)}
                    </motion.div>
                  </motion.section>
                ))}
              </motion.div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ item: entry }) {
  const body = (
    <>
      <span className="row-icon">
        <Icon name={entry.type} size={16} />
      </span>
      <span className="data-row-main">
        <span className="data-row-title">{entry.title}</span>
        <span className="data-row-meta">
          {`${entry.modulePosition}. ${entry.moduleTitle}`}
        </span>
      </span>
    </>
  );

  // Same rule as the course page, from the same function: an activity the
  // server will refuse is not a link. Here the reason matters more, because
  // the row is a long way from the module that is blocking it.
  if (!entry.unlocked) {
    return (
      <motion.div className="row-static" variants={item}>
        {body}
        <span className="chip">
          <Icon name="locked" size={11} />
          {entry.blockedBy
            ? `After ${entry.blockedBy.module.position}. ${entry.blockedBy.module.title}`
            : 'Locked'}
        </span>
        <span className="sr-only">Locked</span>
      </motion.div>
    );
  }

  return (
    <motion.div variants={item}>
      <Link
        to={`/trainee/activity/${entry.id}`}
        state={{ courseId: entry.courseId }}
        className="row-link"
      >
        {body}
        {entry.completed && (
          <span className="badge-pill pill-positive">
            <Icon name="done" size={11} />
            Done
          </span>
        )}
        <Icon name="next" size={16} className="row-chevron" />
      </Link>
    </motion.div>
  );
}

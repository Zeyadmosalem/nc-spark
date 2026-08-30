import { useState } from 'react';
import { materialUrl } from '../../api/materials';
import {
  useCourseMaterials, useAddMaterialFile, useAddMaterialLink, useRemoveMaterial,
} from '../../hooks/useMaterials';
import QueryError from './QueryError';
import Alert from '../ui/Alert';
import EmptyState from '../ui/EmptyState';
import Icon from '../ui/Icon';
import { SkeletonList } from '../ui/Skeleton';
import { useToast } from '../ui/toast-context';

/**
 * Handouts on a course: uploaded files and external links.
 *
 * One component for both sides. A trainee sees the list; an admin or the
 * owning trainer additionally gets the add and remove controls, which is
 * exactly the split course_materials_select and course_materials_write
 * already enforce — `canManage` decides what to render, the database decides
 * what is allowed.
 *
 * The bucket is private, so a stored file has no permanent URL. The link is
 * signed on click and lasts five minutes: signing the whole list on render
 * would mint a URL for every file whether or not anyone wanted it, and they
 * would be stale by the time they were used.
 */

/* Mirrors course_materials.kind. Icon.jsx already carries these names. */
const ICON = { pdf: 'pdf', pptx: 'pptx', docx: 'docx', xlsx: 'xlsx', link: 'link' };

const KIND_LABEL = {
  pdf: 'PDF', pptx: 'Slides', docx: 'Document', xlsx: 'Spreadsheet', link: 'Link',
};

function readableSize(bytes) {
  if (!bytes && bytes !== 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CourseMaterials({ courseId, canManage = false }) {
  const materials = useCourseMaterials(courseId);
  const [adding, setAdding] = useState(false);

  if (materials.isLoading) return <SkeletonList rows={2} label="Loading materials" />;
  if (materials.error) {
    return <QueryError error={materials.error} what="the course materials" />;
  }

  const list = materials.data ?? [];

  return (
    <div className="stack-md">
      {list.length === 0 ? (
        <EmptyState icon="attachment" title="No materials yet">
          {canManage
            ? 'Upload a handout, or link to something hosted elsewhere.'
            : 'Your trainer has not added any handouts to this course.'}
        </EmptyState>
      ) : (
        <div className="card no-hover stack-xs">
          {list.map((m) => (
            <MaterialRow key={m.id} material={m} canManage={canManage} />
          ))}
        </div>
      )}

      {canManage && (adding ? (
        <AddMaterial courseId={courseId} onDone={() => setAdding(false)} />
      ) : (
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            + Add material
          </button>
        </div>
      ))}
    </div>
  );
}

function MaterialRow({ material, canManage }) {
  const { notify } = useToast();
  const remove = useRemoveMaterial();
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const size = readableSize(material.sizeBytes);

  async function open() {
    setOpening(true);
    setFailed(null);
    try {
      const url = await materialUrl(material);
      // noopener because the tab is opened from our origin; without it the
      // new page can reach back through window.opener.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setFailed(err);
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="data-row">
      <span className="row-icon">
                <Icon name={ICON[material.kind] ?? 'file'} size={16} />
              </span>
      <div className="data-row-main">
        <div className="data-row-title">{material.name}</div>
        <div className="data-row-meta">
          {KIND_LABEL[material.kind] ?? material.kind}
          {size ? ` · ${size}` : ''}
        </div>
      </div>
      <div className="data-row-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={opening}
          onClick={open}
        >
          {opening ? 'Opening…' : material.externalUrl ? 'Open link' : 'Download'}
        </button>
        {canManage && (confirming ? (
          <>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(
                { id: material.id, courseId: material.courseId, storagePath: material.storagePath },
                { onSuccess: () => notify(`"${material.name}" removed.`) },
              )}
            >
              Remove for good
            </button>
            <button type="button" className="btn btn-ghost btn-sm"
                    onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--danger)' }}
                  disabled={remove.isPending}
                  onClick={() => setConfirming(true)}>
            Remove
          </button>
        ))}
      </div>
      <Alert error={failed ?? remove.error} />
    </div>
  );
}

function AddMaterial({ courseId, onDone }) {
  const { notify } = useToast();
  const addFile = useAddMaterialFile();
  const addLink = useAddMaterialLink();

  const [mode, setMode] = useState('file');
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');

  const busy = addFile.isPending || addLink.isPending;
  const ready = mode === 'file' ? Boolean(file) : url.trim() !== '';

  async function submit(e) {
    e.preventDefault();
    const action = mode === 'file'
      ? addFile.mutateAsync({ courseId, file, name })
      : addLink.mutateAsync({ courseId, name, url });
    await action
      .then(() => {
        notify(`"${name.trim() || file?.name || url}" added.`);
        onDone();
      })
      .catch(() => null);
  }

  return (
    <form
      onSubmit={submit}
      className="u-col u-p4 u-r-lg u-alt u-bordered u-gap-3"
    >
      <div className="tab-navigation" style={{ marginBottom: 0 }}>
        <button type="button" className={`tab-item ${mode === 'file' ? 'active' : ''}`}
                aria-pressed={mode === 'file'} onClick={() => setMode('file')}>
          Upload a file
        </button>
        <button type="button" className={`tab-item ${mode === 'link' ? 'active' : ''}`}
                aria-pressed={mode === 'link'} onClick={() => setMode('link')}>
          Link to something
        </button>
      </div>

      <div>
        <label className="input-label" htmlFor="material-name">
          Name <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(optional)</span>
        </label>
        <input
          id="material-name" className="input-field" value={name}
          placeholder={mode === 'file' ? 'Defaults to the filename' : 'What is this?'}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {mode === 'file' ? (
        <div>
          <label className="input-label" htmlFor="material-file">File</label>
          <input
            id="material-file"
            type="file"
            className="input-field"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {/* The kind column has a CHECK constraint allowing five values, so
              anything else is refused before it is uploaded. */}
          <p className="input-hint mt-xs">
            PDF, Word, PowerPoint or Excel.
          </p>
        </div>
      ) : (
        <div>
          <label className="input-label" htmlFor="material-url">Address</label>
          <input
            id="material-url" type="url" className="input-field" value={url}
            placeholder="https://"
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
      )}

      <Alert error={addFile.error ?? addLink.error} />

      <div className="cluster">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !ready}>
          {busy ? 'Adding…' : 'Add'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

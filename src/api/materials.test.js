import { describe, it, expect, vi, beforeEach } from 'vitest';

const from = vi.fn();
const getSession = vi.fn();
const upload = vi.fn();
const remove = vi.fn();
const createSignedUrl = vi.fn();
const storageFrom = vi.fn(() => ({ upload, remove, createSignedUrl }));
const client = {
  from, auth: { getSession }, storage: { from: storageFrom }, functions: { invoke: vi.fn() },
};
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const {
  listCourseMaterials, addMaterialFile, addMaterialLink, removeMaterial,
  materialUrl, kindForFile,
} = await import('./materials');

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } } });
  upload.mockResolvedValue({ error: null });
  remove.mockResolvedValue({ error: null });
  createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/x' }, error: null });
});

function chain(result, calls = []) {
  const obj = {
    calls,
    select: (...a) => { calls.push(['select', ...a]); return obj; },
    insert: (...a) => { calls.push(['insert', ...a]); return obj; },
    delete: (...a) => { calls.push(['delete', ...a]); return obj; },
    eq:     (...a) => { calls.push(['eq', ...a]);     return obj; },
    order:  (...a) => { calls.push(['order', ...a]);  return obj; },
    single: () => Promise.resolve(result),
    then: (res, rej) => Promise.resolve(result).then(res, rej),
  };
  return obj;
}

const row = {
  id: 'm1', course_id: 'c1', name: 'Handbook.pdf', kind: 'pdf',
  storage_path: 'c1/1-Handbook.pdf', external_url: null,
  size_bytes: 2048, created_at: '2026-02-01T00:00:00Z',
};

describe('kindForFile', () => {
  /**
   * `kind` has a CHECK constraint allowing only these five. Guessing a kind
   * for an unknown extension would produce an insert that cannot succeed, so
   * this returns null and the form refuses instead.
   */
  it.each([
    ['notes.pdf', 'pdf'], ['deck.pptx', 'pptx'], ['deck.PPT', 'pptx'],
    ['form.docx', 'docx'], ['form.doc', 'docx'], ['data.xlsx', 'xlsx'],
  ])('maps %s to %s', (name, kind) => {
    expect(kindForFile(name)).toBe(kind);
  });

  it.each(['photo.png', 'archive.zip', 'noextension', '', null])(
    'refuses %s rather than guessing', (name) => {
      expect(kindForFile(name)).toBeNull();
    },
  );
});

describe('listCourseMaterials', () => {
  it('maps rows to camelCase, oldest first', async () => {
    const c = chain({ data: [row], error: null });
    from.mockReturnValue(c);
    const out = await listCourseMaterials('c1');
    expect(out[0]).toEqual({
      id: 'm1', courseId: 'c1', name: 'Handbook.pdf', kind: 'pdf',
      storagePath: 'c1/1-Handbook.pdf', externalUrl: null,
      sizeBytes: 2048, createdAt: '2026-02-01T00:00:00Z',
    });
    expect(c.calls).toContainEqual(['order', 'created_at', { ascending: true }]);
  });

  it('returns nothing, without a round trip, for no course', async () => {
    expect(await listCourseMaterials(undefined)).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });
});

describe('addMaterialFile', () => {
  const file = { name: 'Handbook.pdf', size: 2048 };

  it('uploads first, then records the row', async () => {
    from.mockReturnValue(chain({ data: row, error: null }));
    const out = await addMaterialFile({ courseId: 'c1', file });
    expect(upload).toHaveBeenCalled();
    expect(out.id).toBe('m1');
  });

  it('refuses a file type the constraint would reject', async () => {
    await expect(addMaterialFile({ courseId: 'c1', file: { name: 'cat.png', size: 1 } }))
      .rejects.toThrow(/PDF, Word, PowerPoint and Excel/);
    expect(upload).not.toHaveBeenCalled();
  });

  /**
   * A row pointing at an object that is not there is a broken download for
   * every trainee on the course. An object with no row is invisible and costs
   * only storage — so if the insert fails, the upload is taken back.
   */
  it('removes the uploaded object when the row cannot be written', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'permission denied' } }));
    await expect(addMaterialFile({ courseId: 'c1', file })).rejects.toThrow(/permission denied/);
    expect(remove).toHaveBeenCalled();
  });

  it('falls back to the filename when no name is given', async () => {
    const c = chain({ data: row, error: null });
    from.mockReturnValue(c);
    await addMaterialFile({ courseId: 'c1', file, name: '   ' });
    expect(c.calls[0][1].name).toBe('Handbook.pdf');
  });
});

describe('addMaterialLink', () => {
  /**
   * course_materials_has_target is an exclusive or:
   * (storage_path is not null) <> (external_url is not null). A link must set
   * one and leave the other alone.
   */
  it('sets the url and no storage path', async () => {
    const c = chain({ data: { ...row, kind: 'link', storage_path: null, external_url: 'https://x' }, error: null });
    from.mockReturnValue(c);
    await addMaterialLink({ courseId: 'c1', name: 'Regulations', url: ' https://x ' });
    const inserted = c.calls[0][1];
    expect(inserted.kind).toBe('link');
    expect(inserted.external_url).toBe('https://x');
    expect(inserted.storage_path).toBeUndefined();
  });
});

describe('removeMaterial', () => {
  it('deletes the row, then the object', async () => {
    const c = chain({ data: null, error: null });
    from.mockReturnValue(c);
    await removeMaterial({ id: 'm1', storagePath: 'c1/f.pdf' });
    expect(c.calls).toContainEqual(['eq', 'id', 'm1']);
    expect(remove).toHaveBeenCalledWith(['c1/f.pdf']);
  });

  it('has no object to remove for a link', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    await removeMaterial({ id: 'm1', storagePath: null });
    expect(remove).not.toHaveBeenCalled();
  });

  /**
   * The material is already gone as far as anyone using the app is concerned.
   * Reporting a storage error here would suggest the delete had not worked.
   */
  it('does not fail because the object could not be deleted', async () => {
    from.mockReturnValue(chain({ data: null, error: null }));
    remove.mockRejectedValue(new Error('storage down'));
    await expect(removeMaterial({ id: 'm1', storagePath: 'c1/f.pdf' })).resolves.toBeUndefined();
  });

  it('still throws when the row itself cannot be deleted', async () => {
    from.mockReturnValue(chain({ data: null, error: { message: 'denied' } }));
    await expect(removeMaterial({ id: 'm1', storagePath: null })).rejects.toThrow(/denied/);
  });
});

describe('materialUrl', () => {
  it('returns an external link unchanged', async () => {
    expect(await materialUrl({ externalUrl: 'https://gov.example/reg' }))
      .toBe('https://gov.example/reg');
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  // The bucket is private, so a stored file is unreachable without one.
  it('signs a stored file', async () => {
    expect(await materialUrl({ externalUrl: null, storagePath: 'c1/f.pdf' }))
      .toBe('https://signed/x');
    expect(storageFrom).toHaveBeenCalledWith('course-materials');
  });
});

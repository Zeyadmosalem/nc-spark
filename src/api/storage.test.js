import { describe, it, expect, vi, beforeEach } from 'vitest';

const upload = vi.fn();
const createSignedUrl = vi.fn();
const fromBucket = vi.fn(() => ({ upload, createSignedUrl }));
const client = { storage: { from: fromBucket } };
vi.mock('./client', () => ({
  supabase: client, isConfigured: true, requireClient: () => client,
}));

const { uploadSubmission, uploadCourseMaterial, signedUrlFor } = await import('./storage');

const blob = (name) => ({ name, size: 5, type: 'text/plain' });

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue({ data: {}, error: null });
  createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed' }, error: null });
});

const pathOf = () => upload.mock.calls[0][0];

describe('uploadSubmission', () => {
  it('writes under {courseId}/{traineeId}/', async () => {
    await uploadSubmission({ courseId: 'c1', traineeId: 't1', file: blob('essay.pdf') });
    expect(fromBucket).toHaveBeenCalledWith('submissions');
    expect(pathOf()).toMatch(/^c1\/t1\/\d+-essay\.pdf$/);
  });

  it('returns the stored path', async () => {
    const { path } = await uploadSubmission({ courseId: 'c1', traineeId: 't1', file: blob('a.txt') });
    expect(path).toBe(pathOf());
  });

  it('never overwrites an existing submission', async () => {
    await uploadSubmission({ courseId: 'c1', traineeId: 't1', file: blob('a.txt') });
    expect(upload.mock.calls[0][2]).toEqual({ upsert: false });
  });

  it('throws the server message on failure', async () => {
    upload.mockResolvedValue({ data: null, error: { message: 'new row violates policy' } });
    await expect(uploadSubmission({ courseId: 'c1', traineeId: 't1', file: blob('a.txt') }))
      .rejects.toThrow(/violates policy/);
  });

  // Storage policies authorise on the first two path segments. A filename that
  // can inject a slash or climb a level would land the file in someone else's
  // folder — where the policy would then judge it by THAT folder's owner.
  it.each([
    ['../../other/hack.txt'],
    ['..\\..\\other\\hack.txt'],
    ['a/b/c.txt'],
    ['....//evil.txt'],
  ])('refuses to let %s escape the trainee prefix', async (name) => {
    await uploadSubmission({ courseId: 'c1', traineeId: 't1', file: blob(name) });
    const path = pathOf();
    expect(path.startsWith('c1/t1/')).toBe(true);
    expect(path.split('/')).toHaveLength(3);
    expect(path).not.toMatch(/\.\./);
  });

  it('falls back to a usable name when the filename sanitises away', async () => {
    await uploadSubmission({ courseId: 'c1', traineeId: 't1', file: blob('/') });
    expect(pathOf()).toMatch(/^c1\/t1\/\d+-_$/);
  });
});

describe('uploadCourseMaterial', () => {
  it('writes under {courseId}/', async () => {
    await uploadCourseMaterial({ courseId: 'c1', file: blob('manual.pdf') });
    expect(fromBucket).toHaveBeenCalledWith('course-materials');
    expect(pathOf()).toMatch(/^c1\/\d+-manual\.pdf$/);
  });

  it('keeps a traversal attempt inside the course prefix', async () => {
    await uploadCourseMaterial({ courseId: 'c1', file: blob('../../../etc/passwd') });
    expect(pathOf().split('/')).toHaveLength(2);
  });
});

describe('signedUrlFor', () => {
  it('returns a short-lived url for a private object', async () => {
    const url = await signedUrlFor('submissions', 'c1/t1/a.txt');
    expect(createSignedUrl).toHaveBeenCalledWith('c1/t1/a.txt', 300);
    expect(url).toBe('https://signed');
  });

  it('throws when the object is not readable', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    await expect(signedUrlFor('submissions', 'x')).rejects.toThrow(/not found/);
  });
});

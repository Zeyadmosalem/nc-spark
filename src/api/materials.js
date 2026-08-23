import { requireClient } from './client';
import { unwrap, currentUserId } from './helpers';
import { uploadCourseMaterial, signedUrlFor } from './storage';

/**
 * Course handouts: uploaded files and external links.
 *
 * `course_materials`, its RLS, the private `course-materials` bucket, the four
 * storage policies and `uploadCourseMaterial` have all existed since M3. No
 * code ever read the table, so the trainee Materials tab was a hardcoded
 * "nothing uploaded yet" that could never say anything else.
 *
 * Read is admin, owning trainer, or enrolled trainee. Write is admin or owning
 * trainer. Both come from policies that were already there; nothing new was
 * granted for this.
 */

/** The `kind` check constraint allows exactly these. */
export const MATERIAL_KINDS = ['pdf', 'pptx', 'docx', 'xlsx', 'link'];

const EXTENSION_KIND = {
  pdf: 'pdf',
  ppt: 'pptx', pptx: 'pptx',
  doc: 'docx', docx: 'docx',
  xls: 'xlsx', xlsx: 'xlsx',
};

/**
 * Maps a filename to a storable `kind`.
 *
 * Returns null rather than guessing for anything else, because the constraint
 * rejects an unknown kind outright — better to refuse in the form than to send
 * an insert that cannot succeed.
 */
export function kindForFile(filename) {
  const ext = String(filename ?? '').split('.').pop()?.toLowerCase();
  return EXTENSION_KIND[ext] ?? null;
}

const toCamel = (r) => ({
  id: r.id,
  courseId: r.course_id,
  name: r.name,
  kind: r.kind,
  storagePath: r.storage_path ?? null,
  externalUrl: r.external_url ?? null,
  sizeBytes: r.size_bytes ?? null,
  createdAt: r.created_at,
});

const COLUMNS =
  'id, course_id, name, kind, storage_path, external_url, size_bytes, created_at';

export async function listCourseMaterials(courseId) {
  if (!courseId) return [];
  const rows = unwrap(await requireClient()
    .from('course_materials')
    .select(COLUMNS)
    .eq('course_id', courseId)
    .order('created_at', { ascending: true }));
  return (rows ?? []).map(toCamel);
}

/**
 * Uploads the file, then records it.
 *
 * In that order on purpose: a row pointing at an object that failed to upload
 * is a broken download for every trainee on the course, whereas an object with
 * no row is invisible and costs only storage. If the insert fails the upload
 * is removed again, so the usual case leaves nothing behind either.
 */
export async function addMaterialFile({ courseId, file, name }) {
  const kind = kindForFile(file?.name);
  if (!kind) {
    throw new Error('Only PDF, Word, PowerPoint and Excel files can be uploaded.');
  }

  const { path } = await uploadCourseMaterial({ courseId, file });

  try {
    const row = unwrap(await requireClient()
      .from('course_materials')
      .insert({
        course_id: courseId,
        name: name?.trim() || file.name,
        kind,
        storage_path: path,
        size_bytes: file.size ?? null,
        uploaded_by: await currentUserId(),
      })
      .select(COLUMNS).single());
    return toCamel(row);
  } catch (err) {
    await requireClient().storage.from('course-materials').remove([path]).catch(() => null);
    throw err;
  }
}

/**
 * A link, which the constraint treats as the other half of an exclusive or:
 * `(storage_path is not null) <> (external_url is not null)`.
 */
export async function addMaterialLink({ courseId, name, url }) {
  const row = unwrap(await requireClient()
    .from('course_materials')
    .insert({
      course_id: courseId,
      name: name?.trim() || url,
      kind: 'link',
      external_url: url.trim(),
      uploaded_by: await currentUserId(),
    })
    .select(COLUMNS).single());
  return toCamel(row);
}

/**
 * Removes the row, then the object.
 *
 * The reverse of the upload order, for the same reason: losing the row first
 * means the download disappears immediately, and a leftover object is
 * invisible. A failed object delete is swallowed — the material is already
 * gone as far as anyone using the app is concerned, and reporting a storage
 * error would suggest the delete had not worked.
 */
export async function removeMaterial({ id, storagePath }) {
  unwrap(await requireClient().from('course_materials').delete().eq('id', id));
  if (storagePath) {
    await requireClient().storage.from('course-materials')
      .remove([storagePath]).catch(() => null);
  }
}

/** Where to send someone who clicked a material. */
export function materialUrl(material) {
  if (material.externalUrl) return Promise.resolve(material.externalUrl);
  // The bucket is private, so a stored file needs a short-lived signed URL.
  return signedUrlFor('course-materials', material.storagePath);
}

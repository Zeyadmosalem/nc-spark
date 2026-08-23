import { requireClient } from './client';

/**
 * Strips anything that could change the meaning of the path.
 *
 * Storage policies authorise on the first two path segments, so a filename
 * that can inject a slash or climb a level would land the object in another
 * trainee's folder — where the policy would then judge it by THAT folder's
 * owner. Separators go first, then dot runs, then everything unfamiliar.
 */
function safeName(name) {
  const cleaned = String(name ?? '')
    .replace(/[/\\]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(-120);
  return cleaned || 'file';
}

// Date.now keeps two uploads of the same filename from colliding, which
// matters because these uploads deliberately never overwrite.
const stamped = (name) => `${Date.now()}-${safeName(name)}`;

export async function uploadSubmission({ courseId, traineeId, file }) {
  const path = `${courseId}/${traineeId}/${stamped(file.name)}`;
  const { error } = await requireClient().storage.from('submissions')
    .upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return { path };
}

export async function uploadCourseMaterial({ courseId, file }) {
  const path = `${courseId}/${stamped(file.name)}`;
  const { error } = await requireClient().storage.from('course-materials')
    .upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return { path };
}

/** Both buckets are private, so every read needs a short-lived signed URL. */
export async function signedUrlFor(bucket, path, expiresIn = 300) {
  const { data, error } = await requireClient().storage.from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

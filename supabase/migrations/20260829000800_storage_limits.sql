-- Neither bucket had a size limit or a type restriction.
--
--   file_size_limit    null
--   allowed_mime_types null
--
-- and nothing validated in the browser either. CourseMaterials.jsx carries
-- accept=".pdf,.doc,.docx,..." on the file input, which is a picker filter —
-- it changes which files the dialog shows and nothing else. Any enrolled
-- trainee could upload anything, at any size, up to the project-wide default.
--
-- Both buckets are private and read through short-lived signed URLs served
-- from Supabase's own origin, so this is storage abuse rather than stored XSS.

-- 50 MB: a slide deck with images, and nothing like a video.
--
-- The MIME list is not a new rule. public.course_materials already constrains
-- `kind` to exactly pdf / pptx / docx / xlsx, so anything else was going to be
-- rejected by the row insert anyway — but the OBJECT lands in the bucket
-- first, so a file of any type could be stored and simply orphaned. This makes
-- the bucket refuse what the table was always going to refuse.
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array[
         'application/pdf',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/vnd.ms-powerpoint',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.ms-excel'
       ]
 where id = 'course-materials';

-- 25 MB, and deliberately NO type restriction.
--
-- What a trainee may hand in is a decision about the course, not about
-- security: the file submission activity has no accept list, and inventing one
-- here would silently start rejecting legitimate work. The size cap is the
-- part that is unambiguous, and it is what stops one account filling the
-- bucket.
update storage.buckets
   set file_size_limit = 26214400
 where id = 'submissions';

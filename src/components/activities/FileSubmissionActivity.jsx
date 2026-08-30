import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '../ui/Icon';
import { uploadSubmission } from '../../api/storage';

export default function FileSubmissionActivity({ activity, onComplete }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);
  // Stable per activity so two submissions on one page cannot share an id.
  const inputId = `submission-file-${activity?.id ?? 'activity'}`;

  if (!activity) return <div>No activity provided.</div>;

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  // The file goes straight to Storage, not through an Edge Function: the
  // bucket policy authorises on the path prefix, so a trainee can only write
  // beneath their own id. The completion carries the resulting path so the
  // trainer can find what was actually submitted.
  const handleUpload = async () => {
    if (!file || isUploading) return;
    setIsUploading(true);
    setUploadError(null);
    setProgress(50);
    try {
      const { path } = await uploadSubmission({
        courseId: activity.courseId,
        traineeId: activity.traineeId,
        file,
      });
      setProgress(100);
      setIsSubmitted(true);
      onComplete?.({ storagePath: path, filename: file.name });
    } catch (err) {
      setUploadError(err.message);
      setProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="stack-lg">
      {/* The description is NOT rendered here. ActivityWrapper, which every
          activity is mounted inside, already prints it under the title — so
          this printed the same sentence twice on every submission page. */}
      <AnimatePresence mode="wait">
        {!isSubmitted ? (
          <motion.div
            key="upload-area"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            {/* The drop zone was a <div onClick> wrapping an input hidden
                with display:none. Neither is focusable, so there was no
                keyboard route to the file picker at all — a trainee using a
                keyboard or a screen reader could not hand in an assignment,
                on an activity that gates the rest of the course.

                A label pointing at a visually-hidden-but-focusable input is
                the ordinary way to do this: the input keeps its own keyboard
                behaviour and accessible name, and the label makes the whole
                panel clickable without inventing a control. */}
            <div
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <input
                id={inputId}
                type="file"
                className="sr-only"
                ref={fileInputRef}
                onChange={handleFileSelect}
              />
              <label htmlFor={inputId} className="dropzone-label">
                <span className="empty-state-icon" style={{ margin: '0 auto 1rem' }}>
                  <Icon name="file" size={22} />
                </span>
                <span style={{ fontSize: '1.2rem', fontWeight: 650, display: 'block', marginBottom: '0.5rem' }}>
                  {file ? file.name : 'Choose a file, or drop one here'}
                </span>
                <span className="text-sm muted-2">
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                    : 'PDF, image or document from your computer'}
                </span>
              </label>
            </div>

            {uploadError && (
              <div className="alert alert-error" role="alert" aria-live="assertive">
                {uploadError}
              </div>
            )}

            {file && !isUploading && (
              <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                <button className="btn btn-primary" onClick={handleUpload}>
                  Upload File
                </button>
              </div>
            )}

            {isUploading && (
              <div style={{ marginTop: '1.5rem' }}>
                <div className="u-row-top u-between u-text-sm u-mb-2 muted-2">
                  <span>Uploading {file.name}...</span>
                  <span>{Math.min(progress, 100)}%</span>
                </div>
                <div className="progress-track">
                  <motion.div 
                    className="progress-fill" 
                    animate={{ width: `${Math.min(progress, 100)}%` }} 
                    transition={{ ease: "linear", duration: 0.2 }}
                  />
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="success-area"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              padding: '3rem 2rem',
              textAlign: 'center',
              background: 'var(--success-soft)',
              border: '2px solid var(--success)',
              borderRadius: 'var(--r-lg)',
            }}
          >
            <div className="empty-state-icon success" style={{ margin: '0 auto 1rem' }}>
            <Icon name="complete" size={24} />
          </div>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '0.5rem', color: 'var(--success)' }}>Assignment Submitted!</h3>
            <p className="muted-2">Your file <strong>{file?.name}</strong> was successfully uploaded.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

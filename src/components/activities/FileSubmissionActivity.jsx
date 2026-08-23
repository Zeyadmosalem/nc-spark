import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { safeHtml } from '../../lib/sanitizeHtml';
import { uploadSubmission } from '../../api/storage';

export default function FileSubmissionActivity({ activity, onComplete }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div
        style={{ fontSize: '1.05rem', lineHeight: 1.6, color: 'var(--text)' }}
        {...safeHtml(activity.description || 'Please upload your assignment below.')}
      />

      <AnimatePresence mode="wait">
        {!isSubmitted ? (
          <motion.div
            key="upload-area"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border)',
                borderRadius: 'var(--r-lg)',
                padding: '3rem 2rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'var(--surface-alt)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--brand-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                style={{ display: 'none' }} 
              />
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📄</div>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
                {file ? file.name : 'Drag & drop your file here'}
              </h3>
              <p style={{ color: 'var(--text-2)', fontSize: '0.9rem' }}>
                {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'or click to browse from your computer'}
              </p>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-2)' }}>
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
              background: 'rgba(40, 167, 69, 0.05)',
              border: '2px solid #28a745',
              borderRadius: 'var(--r-lg)',
            }}
          >
            <div style={{ fontSize: '3rem', marginBottom: '1rem', color: '#28a745' }}>✅</div>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '0.5rem', color: '#28a745' }}>Assignment Submitted!</h3>
            <p style={{ color: 'var(--text-2)' }}>Your file <strong>{file?.name}</strong> was successfully uploaded.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

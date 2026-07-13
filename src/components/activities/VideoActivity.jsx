export default function VideoActivity({ activity }) {
  if (!activity?.videoId) return <div>No video source provided.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 'var(--r-lg)' }}>
        <iframe
          src={`https://www.youtube.com/embed/${activity.videoId}?rel=0`}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={activity.title}
        />
      </div>
      <div style={{ fontSize: '0.9rem', color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Video duration: {activity.duration || 'Unknown'}</span>
        <span>Watch the entire video before marking complete.</span>
      </div>
    </div>
  );
}

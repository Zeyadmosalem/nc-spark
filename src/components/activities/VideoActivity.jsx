export default function VideoActivity({ activity }) {
  if (!activity?.videoId) return <div>No video source provided.</div>;

  return (
    <div className="stack-md">
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 'var(--r-lg)' }}>
        <iframe
          src={`https://www.youtube.com/embed/${activity.videoId}?rel=0`}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={activity.title}
        />
      </div>
      <div className="u-row-top u-text-base muted-2 u-between">
        <span>Video duration: {activity.duration || 'Unknown'}</span>
        <span>Watch the entire video before marking complete.</span>
      </div>
    </div>
  );
}

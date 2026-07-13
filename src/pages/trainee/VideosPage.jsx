import { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function VideosPage() {
  const { videos } = useApp();
  const [active, setActive] = useState(videos?.[0]?.id || null);

  if (!videos || videos.length === 0) return (
    <div className="page-body"><p>No videos available.</p></div>
  );

  const v = videos.find((x) => x.id === active) || videos[0];

  return (
    <div className="page-body">
      <p className="eyebrow">Video Library</p>
      <h1 className="section-heading">Learning Videos</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1rem', marginTop: '1rem' }}>
        <div>
          {videos.map((video) => (
            <div key={video.id} className={`card no-hover`} style={{ marginBottom: '0.75rem', cursor: 'pointer', border: video.id === active ? '1px solid var(--brand-purple)' : undefined }} onClick={() => setActive(video.id)}>
              <div style={{ fontWeight: 700 }}>{video.title}</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-2)' }}>{video.source}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="card no-hover">
            <div style={{ marginBottom: '0.75rem', fontWeight: 700 }}>{v.title}</div>
            <div className="video-container">
              <iframe src={`https://www.youtube.com/embed/${v.videoId}?rel=0&modestbranding=1`} title={v.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
            <p style={{ marginTop: '0.75rem', color: 'var(--text-2)' }}>{v.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';

export default function Confetti() {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    const colors = ['#00A3E0', '#002F6C', '#003E7E', '#ffb627', '#e23d53', '#28a745'];
    const p = Array.from({ length: 60 }).map((_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 10, // Start near center
      y: 50,
      vx: (Math.random() - 0.5) * 100,
      vy: (Math.random() - 1) * 80 - 20,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      rotation: Math.random() * 360,
      rs: (Math.random() - 0.5) * 360,
    }));
    setParticles(p);

    let animationFrameId;
    let start = performance.now();

    const animate = (time) => {
      const dt = (time - start) / 1000;
      
      setParticles(prev => prev.map(pt => ({
        ...pt,
        x: pt.x + pt.vx * dt,
        y: pt.y + pt.vy * dt,
        vy: pt.vy + 200 * dt, // gravity
        rotation: pt.rotation + pt.rs * dt
      })));

      start = time;
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}vw`,
            top: `${p.y}vh`,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            transform: `rotate(${p.rotation}deg)`,
            opacity: p.y > 100 ? 0 : 1, // fade out when falling off screen
            borderRadius: p.size % 2 === 0 ? '50%' : '2px', // mix of circles and squares
          }}
        />
      ))}
    </div>
  );
}

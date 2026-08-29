import { motion } from 'framer-motion';

export default function ProgressRing({ radius = 40, stroke = 8, progress = 0, color = 'var(--brand-primary)' }) {
  // Clamped for the same reason BarChart clamps: a value outside 0-100 draws a
  // ring that is over-full or inside out, and reads as a rendering fault rather
  // than as the bad number it came from.
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));

  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: radius * 2, height: radius * 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg
        height={radius * 2}
        width={radius * 2}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          stroke="var(--border)"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        <motion.circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, strokeLinecap: 'round' }}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
      </svg>
      <div style={{ position: 'absolute', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: `${radius * 0.5}px` }}>
        {Math.round(pct)}%
      </div>
    </div>
  );
}

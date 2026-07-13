import { useState } from 'react';
import { motion } from 'framer-motion';

export default function FlashcardActivity({ activity }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!activity?.cards || activity.cards.length === 0) return <div>No cards provided.</div>;

  const card = activity.cards[currentIndex];
  const total = activity.cards.length;

  function handleNext() {
    setFlipped(false);
    setTimeout(() => {
      if (currentIndex < total - 1) setCurrentIndex(i => i + 1);
    }, 150);
  }

  function handlePrev() {
    setFlipped(false);
    setTimeout(() => {
      if (currentIndex > 0) setCurrentIndex(i => i - 1);
    }, 150);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ marginBottom: '1rem', color: 'var(--text-2)', fontSize: '0.9rem', fontWeight: 600 }}>
        Card {currentIndex + 1} of {total}
      </div>

      <div 
        style={{ width: '100%', maxWidth: 500, height: 300, perspective: 1000, cursor: 'pointer', marginBottom: '2rem' }}
        onClick={() => setFlipped(!flipped)}
      >
        <motion.div
          style={{ width: '100%', height: '100%', position: 'relative', transformStyle: 'preserve-3d' }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.6, type: 'spring', stiffness: 260, damping: 20 }}
        >
          {/* Front */}
          <div style={{
            position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
            background: 'var(--surface-alt)', border: '2px solid var(--border)', borderRadius: 'var(--r-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center',
            fontSize: '1.25rem', color: 'var(--text)', boxShadow: 'var(--shadow-sm)'
          }}>
            {card.front}
          </div>

          {/* Back */}
          <div style={{
            position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
            background: 'var(--brand-primary)', color: '#fff', border: '2px solid var(--brand-primary)', borderRadius: 'var(--r-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center',
            fontSize: '1.1rem', transform: 'rotateY(180deg)', boxShadow: 'var(--shadow-sm)'
          }}>
            {card.back}
          </div>
        </motion.div>
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button className="btn btn-outline" onClick={handlePrev} disabled={currentIndex === 0}>← Previous</button>
        <button className="btn btn-ghost" onClick={() => setFlipped(!flipped)}>Flip</button>
        <button className="btn btn-outline" onClick={handleNext} disabled={currentIndex === total - 1}>Next →</button>
      </div>
    </div>
  );
}

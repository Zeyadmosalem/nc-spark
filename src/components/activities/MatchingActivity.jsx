import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MatchingActivity({ activity }) {
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [selectedDef, setSelectedDef] = useState(null);
  const [matches, setMatches] = useState([]);

  if (!activity?.pairs) return <div>No matching pairs provided.</div>;

  const totalPairs = activity.pairs.length;

  // Render shuffled in real app, but ordered for demo simplicity unless we shuffle on mount
  // For demo, we'll just list them out.
  
  function handleTermClick(term) {
    if (matches.includes(term)) return;
    if (selectedTerm === term) { setSelectedTerm(null); return; }
    setSelectedTerm(term);
    checkMatch(term, selectedDef);
  }

  function handleDefClick(def) {
    // def is the definition string
    const pair = activity.pairs.find(p => p.definition === def);
    if (!pair || matches.includes(pair.term)) return;
    if (selectedDef === def) { setSelectedDef(null); return; }
    setSelectedDef(def);
    checkMatch(selectedTerm, def);
  }

  function checkMatch(term, def) {
    if (!term || !def) return;
    const pair = activity.pairs.find(p => p.term === term && p.definition === def);
    if (pair) {
      setMatches(prev => [...prev, term]);
      setSelectedTerm(null);
      setSelectedDef(null);
    } else {
      // Incorrect match visual feedback could go here, then reset
      setTimeout(() => {
        setSelectedTerm(null);
        setSelectedDef(null);
      }, 500);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-2)' }}>
        Match the term on the left with its definition on the right.
        <br />
        <strong style={{ color: 'var(--brand-primary)' }}>{matches.length} of {totalPairs} matched</strong>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Terms */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {activity.pairs.map(p => {
            const isMatched = matches.includes(p.term);
            const isSelected = selectedTerm === p.term;
            return (
              <motion.div 
                key={`term-${p.term}`}
                onClick={() => handleTermClick(p.term)}
                animate={{ opacity: isMatched ? 0.3 : 1, scale: isSelected ? 1.02 : 1 }}
                style={{
                  padding: '1rem',
                  background: isSelected ? 'var(--brand-primary)' : 'var(--surface-alt)',
                  color: isSelected ? '#fff' : 'var(--text)',
                  border: `2px solid ${isSelected ? 'var(--brand-primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--r-md)',
                  cursor: isMatched ? 'default' : 'pointer',
                  fontWeight: 600,
                  textAlign: 'center'
                }}
              >
                {p.term}
              </motion.div>
            );
          })}
        </div>

        {/* Definitions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* We'll reverse the array just to mix them up a little bit for the demo without full random shuffle */}
          {[...activity.pairs].reverse().map(p => {
            const isMatched = matches.includes(p.term);
            const isSelected = selectedDef === p.definition;
            return (
              <motion.div 
                key={`def-${p.term}`}
                onClick={() => handleDefClick(p.definition)}
                animate={{ opacity: isMatched ? 0.3 : 1, scale: isSelected ? 1.02 : 1 }}
                style={{
                  padding: '1rem',
                  background: isSelected ? 'var(--brand-accent)' : 'var(--surface-alt)',
                  color: isSelected ? '#fff' : 'var(--text)',
                  border: `2px solid ${isSelected ? 'var(--brand-accent)' : 'var(--border)'}`,
                  borderRadius: 'var(--r-md)',
                  cursor: isMatched ? 'default' : 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                {p.definition}
              </motion.div>
            );
          })}
        </div>
      </div>
      
      <AnimatePresence>
        {matches.length === totalPairs && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: '1rem', background: 'rgba(40, 167, 69, 0.1)', color: '#28a745', textAlign: 'center', borderRadius: 'var(--r-md)', fontWeight: 600 }}
          >
            All pairs matched correctly! You can now mark this activity as complete.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

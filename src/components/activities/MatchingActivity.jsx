import { useMemo, useState } from 'react';
import { shuffleDefinitions } from '../../lib/shuffle';
import { motion, AnimatePresence } from 'framer-motion';

export default function MatchingActivity({ activity }) {
  const [selectedTerm, setSelectedTerm] = useState(null);
  const [selectedDef, setSelectedDef] = useState(null);
  const [matches, setMatches] = useState([]);

  const shuffledPairs = useMemo(() => shuffleDefinitions(activity?.pairs), [activity?.pairs]);

  if (!activity?.pairs) return <div>No matching pairs provided.</div>;

  const totalPairs = activity.pairs.length;
  
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
    <div className="stack-lg">
      <div className="u-text-center muted-2">
        Match the term on the left with its definition on the right.
        <br />
        <strong className="brand">{matches.length} of {totalPairs} matched</strong>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        {/* Terms */}
        <div className="stack">
          {activity.pairs.map(p => {
            const isMatched = matches.includes(p.term);
            const isSelected = selectedTerm === p.term;
            return (
              <motion.button
                type="button"
                key={`term-${p.term}`}
                onClick={() => handleTermClick(p.term)}
                disabled={isMatched}
                aria-pressed={isSelected}
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
              </motion.button>
            );
          })}
        </div>

        {/* Definitions */}
        <div className="stack">
          {shuffledPairs.map(p => {
            const isMatched = matches.includes(p.term);
            const isSelected = selectedDef === p.definition;
            return (
              <motion.button
                type="button"
                key={`def-${p.term}`}
                onClick={() => handleDefClick(p.definition)}
                disabled={isMatched}
                aria-pressed={isSelected}
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
              </motion.button>
            );
          })}
        </div>
      </div>
      
      <AnimatePresence>
        {matches.length === totalPairs && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: '1rem', background: 'var(--success-soft)', color: 'var(--success)', textAlign: 'center', borderRadius: 'var(--r-md)', fontWeight: 600 }}
          >
            All pairs matched correctly! You can now mark this activity as complete.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

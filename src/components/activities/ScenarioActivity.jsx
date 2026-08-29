import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { safeHtml } from '../../lib/sanitizeHtml';
import Icon from '../ui/Icon';

export default function ScenarioActivity({ activity }) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isDone, setIsDone] = useState(false);

  if (!activity?.steps || activity.steps.length === 0) return <div>No scenario steps provided.</div>;

  const step = activity.steps[currentStepIndex];

  function handleChoiceClick(choice) {
    if (showFeedback) return;
    setSelectedChoice(choice);
    setShowFeedback(true);
  }

  function handleNextStep() {
    if (currentStepIndex < activity.steps.length - 1) {
      setCurrentStepIndex(i => i + 1);
      setSelectedChoice(null);
      setShowFeedback(false);
    } else {
      setIsDone(true);
    }
  }

  // Simple markdown formatting for step text. The result is sanitized before
  // it is rendered, so trainer-authored text cannot inject active content.
  const formattedText = step.text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code class="inline-code">$1</code>')
    .replace(/\n\n/g, '<br/><br/>');

  return (
    <div className="stack-lg">
      <div style={{ color: 'var(--text-3)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Situation {currentStepIndex + 1} of {activity.steps.length}
      </div>

      <div
        style={{ fontSize: '1.1rem', lineHeight: 1.6, color: 'var(--text)' }}
        {...safeHtml(formattedText)}
      />

      <div className="stack">
        {step.choices.map((choice) => {
          const isSelected = selectedChoice?.id === choice.id;
          let bgColor = 'var(--surface-alt)';
          let borderColor = 'var(--border)';
          let textColor = 'var(--text)';

          if (showFeedback) {
            if (isSelected) {
              if (choice.isCorrect) {
                bgColor = 'var(--success-soft)';
                borderColor = 'var(--success)';
                textColor = 'var(--success)';
              } else {
                bgColor = 'var(--danger-soft)';
                borderColor = 'var(--danger)';
                textColor = 'var(--danger)';
              }
            } else if (choice.isCorrect) {
              // Highlight correct answer if they got it wrong
              bgColor = 'var(--success-soft)';
              borderColor = 'var(--success)';
              textColor = 'var(--success)';
            }
          }

          return (
            <button
              key={choice.id}
              onClick={() => handleChoiceClick(choice)}
              style={{
                textAlign: 'left',
                padding: '1rem',
                background: bgColor,
                border: `2px solid ${borderColor}`,
                borderRadius: 'var(--r-md)',
                color: textColor,
                fontSize: '1rem',
                cursor: showFeedback ? 'default' : 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}
            >
              <div style={{ 
                width: 24, height: 24, borderRadius: '50%', border: `2px solid ${borderColor}`, 
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 
              }}>
                {showFeedback && choice.isCorrect && <Icon name="done" size={14} />}
                {showFeedback && isSelected && !choice.isCorrect && <Icon name="close" size={14} />}
              </div>
              {choice.text}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {showFeedback && selectedChoice && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            style={{ 
              background: 'var(--surface)', borderLeft: `4px solid ${selectedChoice.isCorrect ? 'var(--success)' : 'var(--danger)'}`,
              padding: '1.25rem', borderRadius: '0 var(--r-md) var(--r-md) 0', marginTop: '1rem'
            }}
          >
            <h4 style={{ color: selectedChoice.isCorrect ? 'var(--success)' : 'var(--danger)', marginBottom: '0.5rem', fontSize: '1rem' }}>
              {selectedChoice.isCorrect ? 'Correct!' : 'Not quite.'}
            </h4>
            <p style={{ color: 'var(--text-2)', fontSize: '0.95rem', lineHeight: 1.5 }}>
              {selectedChoice.feedback}
            </p>
            
            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              {!isDone ? (
                <button className="btn btn-primary" onClick={handleNextStep}>
                  {currentStepIndex < activity.steps.length - 1 ? 'Next situation' : 'Finish'}
                  <Icon name="forward" size={14} />
                </button>
              ) : (
                <span style={{ color: 'var(--brand-primary)', fontWeight: 600 }}>Scenario Complete! You can now mark this activity as complete.</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

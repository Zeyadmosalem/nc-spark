import { Component } from 'react';
import Icon from '../ui/Icon';

/**
 * Catches render/lifecycle errors in the subtree below it so a single broken
 * component shows a recoverable panel instead of blanking the whole app.
 *
 * Error boundaries have no hook equivalent, so this has to stay a class.
 *
 * @param {string}   [title]    Heading shown in the fallback panel.
 * @param {function} [onReset]  Extra cleanup run when the user clicks "Try again".
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept as console output for now; swap for a real reporter (Sentry et al.)
    // once the backend lands.
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { title = 'Something went wrong' } = this.props;

    return (
      <div className="page-body">
        <div className="card no-hover" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div className="empty-state-icon" style={{ margin: '0 auto 1rem', color: 'var(--danger)' }}>
              <Icon name="warning" size={24} />
            </div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontFamily: 'var(--font-heading)' }}>
            {title}
          </h2>
          <p style={{ color: 'var(--text-2)', maxWidth: '48ch', margin: '0 auto 1.5rem' }}>
            This part of the page failed to load. Your progress has not been lost —
            you can retry, or head back and try again.
          </p>

          {import.meta.env.DEV && (
            <pre
              style={{
                textAlign: 'left', maxWidth: '60ch', margin: '0 auto 1.5rem', padding: '1rem',
                background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)', fontSize: '0.8rem', overflowX: 'auto',
                color: 'var(--text-2)', whiteSpace: 'pre-wrap',
              }}
            >
              {error.message}
            </pre>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={this.handleReset}>Try again</button>
            <button className="btn btn-ghost" onClick={() => window.location.assign('/')}>
              Back to start
            </button>
          </div>
        </div>
      </div>
    );
  }
}

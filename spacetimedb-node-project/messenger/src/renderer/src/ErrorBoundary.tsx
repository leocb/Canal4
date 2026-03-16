import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    this.setState({ componentStack: info.componentStack });
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '32px',
          background: '#0B0E14',
          color: '#F8FAFC',
          fontFamily: 'monospace',
          height: '100vh',
          boxSizing: 'border-box',
          overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <AlertTriangle size={32} color="#EF4444" />
            <span style={{ fontSize: '2rem' }}>Render Error</span>
          </div>
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: '12px',
            padding: '16px',
            marginBottom: '16px',
          }}>
            <div style={{ color: '#EF4444', fontWeight: 700, marginBottom: '8px', fontSize: '1rem' }}>
              {this.state.error?.name}: {this.state.error?.message}
            </div>
            <pre style={{ color: '#94A3B8', fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
              {this.state.error?.stack}
            </pre>
          </div>
          {this.state.componentStack && (
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              padding: '16px',
            }}>
              <div style={{ color: '#94A3B8', fontWeight: 600, marginBottom: '8px', fontSize: '0.85rem' }}>Component Stack</div>
              <pre style={{ color: '#64748B', fontSize: '0.72rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                {this.state.componentStack}
              </pre>
            </div>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: null, componentStack: null })}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              background: '#3B82F6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

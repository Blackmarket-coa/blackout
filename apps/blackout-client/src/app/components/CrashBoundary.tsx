import React, {
  Component,
  Suspense,
  lazy,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { setCrashHandoff } from './crashHandoffStore';

// Lazy-import so the boundary itself doesn't drag the settings bundle in.
// BugReportSettings has its own `Suspense` boundary internally but the lazy()
// call wants one above it too.
const BugReportSettings = lazy(() =>
  import('../features/settings/BugReportSettings').then((m) => ({ default: m.default })),
);

interface CrashBoundaryProps {
  readonly children: ReactNode;
}

interface CrashBoundaryState {
  readonly hasError: boolean;
  readonly error: Error | null;
  readonly mode: 'fallback' | 'report';
}

const fallbackShell: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: 'var(--bg-surface, #111827)',
  color: 'var(--text-primary, #f8fafc)',
  padding: 24,
};

const fallbackCard: React.CSSProperties = {
  width: 'min(640px, 100%)',
  border: '1px solid var(--border-default, #374151)',
  borderRadius: 12,
  background: 'var(--bg-input, #0f172a)',
  padding: 24,
  display: 'grid',
  gap: 16,
};

const buttonRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};

const primaryButton: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--accent-primary, #3b82f6)',
  background: 'var(--accent-primary, #3b82f6)',
  color: 'var(--text-primary, #f8fafc)',
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
};

const ghostButton: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid var(--border-default, #4b5563)',
  background: 'transparent',
  color: 'var(--text-primary, #f8fafc)',
  cursor: 'pointer',
  fontSize: 14,
};

// Truncate from the end so the most useful (innermost) frames are kept.
const tailTo = (text: string | undefined, max: number): string => {
  if (!text) return '';
  return text.length <= max ? text : text.slice(text.length - max);
};

export class CrashBoundary extends Component<CrashBoundaryProps, CrashBoundaryState> {
  state: CrashBoundaryState = { hasError: false, error: null, mode: 'fallback' };

  static getDerivedStateFromError(error: Error): Partial<CrashBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    setCrashHandoff({
      message: error.message,
      stack: error.stack ?? '',
      componentStack: info.componentStack ?? '',
      capturedAt: Date.now(),
    });
    // Also push through console.error so the captured ring buffer records it.
    // installConsoleCapture()'s dedupe will collapse if a window 'error' handler
    // already saw the same throw.
    // eslint-disable-next-line no-console
    console.error('CrashBoundary captured render error:', error, info.componentStack);
  }

  private handleOpenReport = (): void => {
    this.setState({ mode: 'report' });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleGoHome = (): void => {
    window.location.assign('/');
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    if (this.state.mode === 'report') {
      return (
        <Suspense
          fallback={
            <div style={fallbackShell}>
              <p style={{ opacity: 0.85 }}>Loading bug report form…</p>
            </div>
          }
        >
          <BugReportSettings />
        </Suspense>
      );
    }

    const error = this.state.error;
    const detail = tailTo(error?.stack ?? error?.message ?? 'unknown error', 600);

    return (
      <main role="alert" aria-live="assertive" style={fallbackShell}>
        <section style={fallbackCard}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h1>
          <p style={{ margin: 0, opacity: 0.85 }}>
            The app hit an unexpected error and stopped rendering. You can reload to
            try again, head home, or send a bug report so we can fix it.
          </p>
          <pre
            data-testid="crash-detail"
            style={{
              fontSize: 11,
              background: 'rgba(0,0,0,0.25)',
              padding: 10,
              borderRadius: 6,
              maxHeight: 160,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}
          >
            {detail}
          </pre>
          <div style={buttonRow}>
            <button
              type="button"
              onClick={this.handleOpenReport}
              style={primaryButton}
              data-testid="crash-report-cta"
            >
              Report this
            </button>
            <button type="button" onClick={this.handleReload} style={ghostButton}>
              Reload
            </button>
            <button type="button" onClick={this.handleGoHome} style={ghostButton}>
              Go home
            </button>
          </div>
        </section>
      </main>
    );
  }
}

export default CrashBoundary;

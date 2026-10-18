import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../../i18n';
import { WarningCircle } from '../ui/Icon';
import { Button } from '../ui/Button';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen min-h-dvh bg-bg flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 mb-4 rounded-2xl bg-danger-soft flex items-center justify-center text-danger">
            <WarningCircle size={32} aria-hidden="true" />
          </div>
          <h2 className="text-title font-bold text-ink mb-2">
            {i18n.t('app.crashTitle')}
          </h2>
          <p className="text-body text-ink-2 max-w-sm mb-6">
            {i18n.t('app.crashDesc')}
          </p>
          <Button variant="primary" onClick={this.handleReload}>
            {i18n.t('common.retry')}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

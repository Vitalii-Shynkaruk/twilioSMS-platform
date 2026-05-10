import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-dark-950 flex items-center justify-center px-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="card p-8 max-w-md w-full text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-red-400 mb-4" />
            <h2 className="text-lg font-bold text-dark-100 mb-2">Something went wrong</h2>
            <p className="text-sm text-dark-400 mb-1">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <p className="text-xs text-dark-600 font-mono mb-6 break-all">
              {this.state.error?.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

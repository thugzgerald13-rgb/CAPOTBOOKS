// React error boundary (Run 028 / T028): catches render errors, shows friendly fallback.
import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: React.ReactNode; fallback?: React.ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try { console.error('[ErrorBoundary]', error, info); } catch { /* ignore */ }
  }

  handleReset = () => { this.setState({ hasError: false, error: undefined }); };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="min-h-[400px] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-rose-700 dark:text-rose-300 mb-2">Something went wrong</h2>
          <p className="text-sm text-rose-600 dark:text-rose-400 mb-4">
            {this.state.error?.message || 'An unexpected error occurred while rendering this page.'}
          </p>
          <div className="flex gap-2 justify-center">
            <button onClick={this.handleReset} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-rose-600 text-white hover:bg-rose-700">
              <RefreshCw className="w-3.5 h-3.5" /> Try Again
            </button>
            <button onClick={() => window.location.reload()} className="px-4 py-2 text-xs font-bold rounded-lg border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/30">
              Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}

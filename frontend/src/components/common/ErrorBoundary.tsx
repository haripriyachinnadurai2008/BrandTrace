import React from 'react';
import { AlertTriangleIcon, RefreshIcon } from '../Icons';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected UI rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[BrandTrace ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
          <div className="max-w-md w-full backdrop-blur-xl bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center shadow-lg">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300 flex items-center justify-center mx-auto mb-4">
              <AlertTriangleIcon className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-extrabold tracking-tight mb-2">Workspace interrupted</h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 mb-5 break-words">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white transition"
            >
              <RefreshIcon className="w-4 h-4" />
              <span>Reload BrandTrace</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}


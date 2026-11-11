import React from 'react';
import { AlertTriangleIcon, RefreshIcon } from '../Icons';

interface ErrorRetryCardProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export const ErrorRetryCard: React.FC<ErrorRetryCardProps> = ({
  title = 'Unable to load workspace data',
  message,
  onRetry,
  retrying = false,
}) => {
  const isWakeHint =
    message.toLowerCase().includes('waking up') ||
    message.toLowerCase().includes('timed out') ||
    message.toLowerCase().includes('cannot reach');

  return (
    <div
      role="alert"
      className="backdrop-blur-md bg-amber-50/90 dark:bg-amber-950/35 border border-amber-300/80 dark:border-amber-800/70 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5">
          <AlertTriangleIcon className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-amber-950 dark:text-amber-200">{title}</h4>
          <p className="text-xs text-amber-900/90 dark:text-amber-200/90 mt-1 leading-relaxed">
            {message}
          </p>
          {isWakeHint && (
            <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-1 font-medium">
              Free hosting instances sleep after inactivity (~30–50s to wake). Click Retry in a moment.
            </p>
          )}
        </div>
      </div>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white transition shrink-0 shadow-xs"
        >
          <RefreshIcon className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
          <span>{retrying ? 'Retrying...' : 'Retry'}</span>
        </button>
      )}
    </div>
  );
};


import React from 'react';
import { LockIcon, ArrowRightIcon } from '../Icons';

interface RoleRestrictedCardProps {
  currentRole: string;
  featureTitle?: string;
  allowedRolesLabel?: string;
  reason?: string;
  onGoBack?: () => void;
}

export const RoleRestrictedCard: React.FC<RoleRestrictedCardProps> = ({
  currentRole,
  featureTitle = 'this section',
  allowedRolesLabel,
  reason,
  onGoBack,
}) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="backdrop-blur-md bg-white/80 dark:bg-slate-900/80 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-8 sm:p-10 text-center max-w-2xl mx-auto shadow-sm"
    >
      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 flex items-center justify-center mx-auto mb-4">
        <LockIcon className="w-6 h-6" />
      </div>

      <h3 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
        Not available for your role
      </h3>

      <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
        {reason || `Your current role (${currentRole}) does not include access to ${featureTitle}.`}
      </p>

      {allowedRolesLabel && (
        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          <span>Available for:</span>
          <span className="font-semibold text-purple-700 dark:text-purple-300">{allowedRolesLabel}</span>
        </div>
      )}

      {onGoBack && (
        <div className="mt-6">
          <button
            type="button"
            onClick={onGoBack}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white transition shadow-xs"
          >
            <span>Go to Content Findings</span>
            <ArrowRightIcon className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};


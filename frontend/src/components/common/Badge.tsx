import React from 'react';
import { RiskTier, ClaimStatus } from '../../types';
import {
  ShieldAlertIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  RefreshIcon,
} from '../Icons';

export interface SemanticBadgeProps {
  type?: 'tier' | 'status' | 'custom';
  value: string;
  className?: string;
}

export const SemanticBadge: React.FC<SemanticBadgeProps> = ({ value, className = '' }) => {
  const normalized = value.toLowerCase();

  // Tier mappings
  if (normalized === 'critical') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-300/80 dark:border-rose-800/80 ${className}`}>
        <ShieldAlertIcon className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
        <span>Critical</span>
      </span>
    );
  }

  if (normalized === 'high') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-300/80 dark:border-orange-800/80 ${className}`}>
        <AlertTriangleIcon className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
        <span>High Priority</span>
      </span>
    );
  }

  if (normalized === 'medium') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800/80 ${className}`}>
        <AlertCircleIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>Medium</span>
      </span>
    );
  }

  if (normalized === 'info') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-300/80 dark:border-blue-800/80 ${className}`}>
        <AlertCircleIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <span>Informational</span>
      </span>
    );
  }

  // Claim Status mappings
  if (normalized === 'verified' || normalized === 'approved') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-800/80 ${className}`}>
        <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>{normalized === 'approved' ? 'Approved' : 'Verified'}</span>
      </span>
    );
  }

  if (normalized === 'contradicted') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-800 dark:text-rose-200 border border-rose-400/80 dark:border-rose-700/80 ${className}`}>
        <XCircleIcon className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
        <span>Contradicted</span>
      </span>
    );
  }

  if (normalized === 'unverified') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800/80 ${className}`}>
        <ClockIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>Unverified</span>
      </span>
    );
  }

  if (normalized === 'stale') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-300/80 dark:border-purple-800/80 ${className}`}>
        <RefreshIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
        <span>Marked Stale</span>
      </span>
    );
  }

  if (normalized === 're-review required') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-400 animate-pulse ${className}`}>
        <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>Re-review Required</span>
      </span>
    );
  }

  // Default fallback
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 ${className}`}>
      <span>{value}</span>
    </span>
  );
};

// Aliases for backward compatibility
export const TierBadge: React.FC<{ tier: RiskTier }> = ({ tier }) => (
  <SemanticBadge value={tier} />
);

export const StatusBadge: React.FC<{ status: ClaimStatus | string }> = ({ status }) => (
  <SemanticBadge value={status} />
);

export const ConfidenceBar: React.FC<{ confidence: number }> = ({ confidence }) => {
  const pct = Math.round(confidence * 100);
  const colorClass =
    pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
      <span>Confidence:</span>
      <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">{pct}%</span>
    </div>
  );
};

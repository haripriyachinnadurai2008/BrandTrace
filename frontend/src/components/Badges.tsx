import React from 'react';
import { RiskTier, ClaimStatus } from '../types';

export const TierBadge: React.FC<{ tier: RiskTier }> = ({ tier }) => {
  const styles: Record<RiskTier, string> = {
    Critical: 'bg-red-100 text-red-800 border-red-300 font-semibold',
    High: 'bg-orange-100 text-orange-800 border-orange-300 font-medium',
    Medium: 'bg-amber-100 text-amber-800 border-amber-300 font-medium',
    Info: 'bg-blue-100 text-blue-800 border-blue-300 font-medium',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border ${styles[tier] || 'bg-gray-100 text-gray-800 border-gray-300'}`}
    >
      {tier}
    </span>
  );
};

export const StatusBadge: React.FC<{ status: ClaimStatus | string }> = ({ status }) => {
  const styles: Record<string, string> = {
    Verified: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    Contradicted: 'bg-rose-100 text-rose-800 border-rose-300 font-semibold',
    Unverified: 'bg-amber-100 text-amber-800 border-amber-300',
    Stale: 'bg-purple-100 text-purple-800 border-purple-300 font-medium',
    approved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    live: 'bg-blue-100 text-blue-800 border-blue-300',
    draft: 'bg-slate-100 text-slate-700 border-slate-300',
    archived: 'bg-gray-100 text-gray-600 border-gray-300',
    're-review required': 'bg-amber-100 text-amber-800 border-amber-300 font-semibold animate-pulse',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs border font-medium uppercase tracking-wider ${
        styles[status] || 'bg-gray-100 text-gray-700 border-gray-300'
      }`}
    >
      {status}
    </span>
  );
};

export const ConfidenceBar: React.FC<{ confidence: number }> = ({ confidence }) => {
  const pct = Math.round(confidence * 100);
  const colorClass =
    pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="flex items-center space-x-2 text-xs text-slate-500">
      <span>Confidence:</span>
      <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-slate-700 font-medium">{pct}%</span>
    </div>
  );
};


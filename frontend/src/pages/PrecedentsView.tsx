import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Precedent, UserRole } from '../types';
import { GlassCard } from '../components/common/GlassCard';
import { Skeleton } from '../components/common/Skeleton';
import {
  HistoryIcon,
  CheckCircleIcon,
  SparklesIcon,
} from '../components/Icons';

export const PrecedentsView: React.FC<{ currentRole: UserRole }> = () => {
  const [precedents, setPrecedents] = useState<Precedent[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPrecedents();
  }, []);

  const loadPrecedents = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPrecedents();
      setPrecedents(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load precedents');
    } finally {
      setLoading(false);
    }
  };

  // Group by rule_id
  const groupedByRule = precedents.reduce<Record<string, Precedent[]>>((acc, p) => {
    const key = p.rule_id || 'General Brand Guidelines';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const ruleKeys = Object.keys(groupedByRule);

  return (
    <div className="space-y-6">
      {/* Header */}
      <GlassCard className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <HistoryIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Living Guidelines Lite
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>Institutional Memory</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Historical reviewer overrides and institutional memory: tracks exception decisions with business justifications.
          </p>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100/80 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
          Total Precedents Logged: <strong className="text-purple-600 dark:text-purple-400">{precedents.length}</strong>
        </div>
      </GlassCard>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs animate-in fade-in">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-8 space-y-4">
          <Skeleton className="h-20 w-full" count={2} />
        </div>
      ) : ruleKeys.length === 0 ? (
        <GlassCard className="p-12 text-center text-slate-500 dark:text-slate-400">
          <CheckCircleIcon className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="font-bold text-slate-800 dark:text-slate-200">No reviewer overrides on record.</p>
          <p className="text-xs text-slate-400 mt-1">
            When a reviewer dismisses or overrides a finding with a justification, it automatically appears here.
          </p>
        </GlassCard>
      ) : (
        <div className="space-y-6">
          {ruleKeys.map(ruleId => {
            const list = groupedByRule[ruleId];
            return (
              <GlassCard key={ruleId} className="overflow-hidden">
                <div className="p-4 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold font-mono px-2.5 py-0.5 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded-md border border-purple-200 dark:border-purple-800">
                      {ruleId}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                      Rule Precedents ({list.length})
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">Institutional Review Log</span>
                </div>

                <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                  {list.map((p, idx) => (
                    <div key={p.id || idx} className="p-4 sm:p-5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center space-x-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs uppercase tracking-wider font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                            {p.resolution_action}
                          </span>
                          <span className="text-xs text-slate-400">Reviewer ID: <strong className="text-slate-700 dark:text-slate-300 font-mono">{p.reviewer_id}</strong></span>
                        </div>
                        <span className="text-xs font-mono text-slate-400">
                          {new Date(p.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        </span>
                      </div>

                      <div className="mt-3 text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                        <span className="text-xs text-slate-400 block font-semibold mb-1">Original Finding Summary:</span>
                        <p className="italic text-slate-700 dark:text-slate-300 bg-slate-100/60 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs leading-relaxed">
                          &quot;{p.finding_summary}&quot;
                        </p>
                      </div>

                      <div className="mt-3 text-xs sm:text-sm text-slate-900 dark:text-slate-100 bg-purple-500/10 p-3 rounded-xl border border-purple-200 dark:border-purple-800">
                        <span className="text-xs text-purple-700 dark:text-purple-300 font-bold block mb-1">Reviewer Decision Rationale:</span>
                        <p className="text-slate-800 dark:text-slate-200 text-xs font-medium leading-relaxed">
                          {p.reason}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
};

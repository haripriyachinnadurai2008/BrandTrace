import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Precedent, UserRole } from '../types';
import { FileTextIcon, HistoryIcon, CheckCircleIcon, SparklesIcon } from '../components/Icons';

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <HistoryIcon className="w-5 h-5 text-purple-600" />
            <h1 className="text-xl font-bold text-slate-900">Living Guidelines Lite</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">
              Named Improvement #3
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Historical reviewer overrides and institutional memory: tracks exception decisions with business justifications.
          </p>
        </div>

        <div className="text-xs text-slate-500 font-mono bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
          Total Precedents Logged: <strong className="text-purple-700">{precedents.length}</strong>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-slate-400">Loading precedent library...</div>
      ) : ruleKeys.length === 0 ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500">
          <CheckCircleIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="font-medium text-slate-700">No reviewer overrides on record.</p>
          <p className="text-xs text-slate-400 mt-1">
            When a reviewer dismisses or overrides a finding with a justification, it automatically appears here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {ruleKeys.map(ruleId => {
            const list = groupedByRule[ruleId];
            return (
              <div key={ruleId} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold font-mono px-2 py-0.5 bg-purple-100 text-purple-800 rounded">
                      {ruleId}
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      Rule Precedents ({list.length})
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">Institutional Review Log</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {list.map((p, idx) => (
                    <div key={p.id || idx} className="p-4 hover:bg-slate-50/50 transition">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded text-xs uppercase tracking-wider font-semibold bg-slate-200 text-slate-700">
                            {p.resolution_action}
                          </span>
                          <span className="text-xs text-slate-400">Reviewer ID: <strong className="text-slate-700 font-mono">{p.reviewer_id}</strong></span>
                        </div>
                        <span className="text-xs font-mono text-slate-400">
                          {new Date(p.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-slate-800">
                        <span className="text-xs text-slate-400 block font-medium">Original Finding Summary:</span>
                        <p className="italic text-slate-700 bg-slate-50 p-2 rounded border border-slate-200 mt-0.5 text-xs">
                          "{p.finding_summary}"
                        </p>
                      </div>

                      <div className="mt-2 text-sm text-slate-900 bg-purple-50/40 p-2.5 rounded-lg border border-purple-100">
                        <span className="text-xs text-purple-700 font-semibold block">Reviewer Decision Rationale:</span>
                        <p className="mt-0.5 text-slate-800 text-xs font-medium">
                          {p.reason}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};


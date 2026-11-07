import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { AuditLog, UserRole } from '../types';
import { GlassCard } from '../components/common/GlassCard';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import {
  HistoryIcon,
  RefreshIcon,
  ShieldCheckIcon,
} from '../components/Icons';

export const AuditHistoryView: React.FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('');

  useEffect(() => {
    loadLogs();
  }, [entityTypeFilter, actionFilter, currentRole]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {};
      if (entityTypeFilter) params.entity_type = entityTypeFilter;
      if (actionFilter) params.action = actionFilter;
      const data = await api.getAuditLogs(params);
      setLogs(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const isPermitted = currentRole === 'Admin' || currentRole === 'Reviewer';

  return (
    <div className="space-y-6">
      {/* Header */}
      <GlassCard className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <HistoryIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Governance Audit Trail
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              <ShieldCheckIcon className="w-3.5 h-3.5" />
              <span>Append-Only (Trigger Protected)</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Tamper-proof chronological log of all governance actions, editorial decisions, and fact mutations.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadLogs}
          disabled={loading || !isPermitted}
          isLoading={loading}
          leftIcon={<RefreshIcon className="w-4 h-4 text-slate-500" />}
        >
          Refresh Audit Trail
        </Button>
      </GlassCard>

      {!isPermitted ? (
        <GlassCard className="p-12 text-center text-slate-500 dark:text-slate-400">
          <ShieldCheckIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Access Restricted (Role Guard 403)
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Audit trail inspection is strictly role-gated to <strong>Admin</strong> and <strong>Reviewer</strong>. Switch your active role in the top bar to inspect this ledger.
          </p>
        </GlassCard>
      ) : (
        <>
          {/* Filters Bar */}
          <GlassCard className="p-4 flex flex-wrap gap-4 items-center">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Entity:
              </span>
              <select
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value)}
                className="text-xs border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 bg-white/80 dark:bg-slate-950/80 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-purple-500"
              >
                <option value="">All Entities</option>
                <option value="brand_fact">Brand Fact</option>
                <option value="fact_version">Fact Version</option>
                <option value="content_item">Content Item</option>
                <option value="content_version">Content Version</option>
                <option value="finding">Finding</option>
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Action:
              </span>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="text-xs border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 bg-white/80 dark:bg-slate-950/80 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-purple-500"
              >
                <option value="">All Actions</option>
                <option value="CREATE">CREATE</option>
                <option value="VERSION_CHANGE">VERSION_CHANGE</option>
                <option value="APPROVE">APPROVE</option>
                <option value="PUBLISH_STATUS">PUBLISH_STATUS</option>
                <option value="CHECK_RUN">CHECK_RUN</option>
                <option value="DISMISS">DISMISS</option>
              </select>
            </div>

            <div className="ml-auto text-xs text-slate-400 font-mono">
              Displaying {logs.length} record(s)
            </div>
          </GlassCard>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs animate-in fade-in">
              {error}
            </div>
          )}

          {/* Audit Logs Table */}
          <GlassCard className="overflow-hidden">
            {loading ? (
              <div className="p-8 space-y-3">
                <Skeleton className="h-6 w-full" count={4} />
              </div>
            ) : logs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 italic">No audit records match filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50/80 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 uppercase text-[11px] font-mono tracking-wider border-b border-slate-200/80 dark:border-slate-800/80">
                    <tr>
                      <th className="py-3 px-4">Timestamp (IST)</th>
                      <th className="py-3 px-3">Action</th>
                      <th className="py-3 px-3">Entity Type</th>
                      <th className="py-3 px-4">Entity ID</th>
                      <th className="py-3 px-3">Actor / Role</th>
                      <th className="py-3 px-4">Decision Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 font-sans">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold font-mono border ${
                            log.action === 'VERSION_CHANGE'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300 dark:border-purple-800'
                              : log.action === 'APPROVE'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                              : log.action === 'PUBLISH_STATUS'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs font-medium text-slate-700 dark:text-slate-300">
                          {log.entity_type}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-400 truncate max-w-[140px]" title={log.entity_id}>
                          {log.entity_id}
                        </td>
                        <td className="py-3 px-3 text-xs">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{log.actor_role || 'System'}</span>
                          {log.actor_id && (
                            <span className="text-slate-400 font-mono block text-[11px] truncate max-w-[100px]">
                              {log.actor_id}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700 dark:text-slate-300">
                          {log.reason || 'No description entered'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
};

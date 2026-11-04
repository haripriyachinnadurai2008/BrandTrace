import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { AuditLog, UserRole } from '../types';
import { HistoryIcon, RefreshIcon, ShieldCheckIcon, CheckCircleIcon } from '../components/Icons';

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <HistoryIcon className="w-5 h-5 text-purple-600" />
            <h1 className="text-xl font-bold text-slate-900">Governance Audit Trail</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
              <ShieldCheckIcon className="w-3.5 h-3.5 mr-1" />
              Append-Only (Trigger Protected)
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Tamper-proof chronological log of all governance actions, editorial decisions, and fact mutations.
          </p>
        </div>

        <button
          onClick={loadLogs}
          disabled={loading || !isPermitted}
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 transition shadow-sm"
        >
          <RefreshIcon className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh Audit Trail
        </button>
      </div>

      {!isPermitted ? (
        <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500">
          <ShieldCheckIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">Access Restricted (Role Guard 403)</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Audit trail inspection is strictly role-gated to <strong>Admin</strong> and <strong>Reviewer</strong>. Switch your active role in the top bar to view this ledger.
          </p>
        </div>
      ) : (
        <>
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-600">Entity Type:</span>
              <select
                value={entityTypeFilter}
                onChange={(e) => setEntityTypeFilter(e.target.value)}
                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 focus:ring-2 focus:ring-purple-500"
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
              <span className="text-xs font-semibold text-slate-600">Action:</span>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800 focus:ring-2 focus:ring-purple-500"
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
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              {error}
            </div>
          )}

          {/* Audit Logs Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-slate-400">Loading audit log entries...</div>
            ) : logs.length === 0 ? (
              <div className="py-12 text-center text-slate-400 italic">No audit records match filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-xs tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Timestamp (IST)</th>
                      <th className="py-3 px-3">Action</th>
                      <th className="py-3 px-3">Entity Type</th>
                      <th className="py-3 px-4">Entity ID</th>
                      <th className="py-3 px-3">Actor / Role</th>
                      <th className="py-3 px-4">Decision Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 text-xs font-mono text-slate-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                        </td>
                        <td className="py-3 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold font-mono ${
                            log.action === 'VERSION_CHANGE'
                              ? 'bg-purple-100 text-purple-800'
                              : log.action === 'APPROVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : log.action === 'PUBLISH_STATUS'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs font-medium text-slate-700">
                          {log.entity_type}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-600 truncate max-w-[140px]" title={log.entity_id}>
                          {log.entity_id}
                        </td>
                        <td className="py-3 px-3 text-xs">
                          <span className="font-medium text-slate-800">{log.actor_role || 'System'}</span>
                          {log.actor_id && (
                            <span className="text-slate-400 font-mono block text-[11px] truncate max-w-[100px]">
                              {log.actor_id}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">
                          {log.reason || 'No description entered'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};


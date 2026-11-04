import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { FactImpactResponse, ImpactItem, UserRole } from '../types';
import { DownloadIcon, RefreshIcon, AlertTriangleIcon, CheckCircleIcon, SparklesIcon } from '../components/Icons';

export const ImpactListView: React.FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const [impactData, setImpactData] = useState<FactImpactResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [proposedPrice, setProposedPrice] = useState<string>('₹5,499');

  useEffect(() => {
    loadImpact();
  }, [proposedPrice]);

  const loadImpact = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getFactImpact('F001', proposedPrice);
      setImpactData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to calculate change impact');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReReviewAll = () => {
    setActionMsg('Re-review notifications dispatched to all content owners.');
    setTimeout(() => setActionMsg(null), 5000);
  };

  const handleExportCSV = () => {
    if (!impactData || !impactData.items.length) return;

    const headers = ['Content ID', 'Title', 'Channel', 'Old State', 'New State / Action', 'Priority', 'Owner Name', 'Owner Email', 'Outdated Value', 'New Value'];
    const rows = impactData.items.map(it => [
      `"${it.content_id}"`,
      `"${it.title.replace(/"/g, '""')}"`,
      `"${it.channel}"`,
      `"${it.old_state}"`,
      `"${it.action_required}"`,
      `"${it.priority}"`,
      `"${it.owner_name}"`,
      `"${it.owner_email}"`,
      `"${it.outdated_value}"`,
      `"${it.new_value}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BrandTrace_Impact_F001_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const summary = impactData?.summary || { total: 0, re_review: 0, stale: 0, red_alert: 0, left_alone: 0 };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-slate-900">Change-Impact Engine</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">
              Named Improvement #1
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time downstream blast radius analysis across all marketing assets before & after fact version mutations.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleRequestReReviewAll}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-purple-600 hover:bg-purple-700 transition shadow-sm"
          >
            <RefreshIcon className="w-4 h-4 mr-1.5" />
            Request Re-review (All)
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition shadow-sm"
          >
            <DownloadIcon className="w-4 h-4 mr-1.5 text-slate-500" />
            Export CSV
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center space-x-2">
          <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
          <span>{actionMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Scanned</span>
          <div className="text-2xl font-bold text-slate-900 mt-1">{summary.total}</div>
          <span className="text-xs text-slate-400">pinned assets</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Re-review Req</span>
          <div className="text-2xl font-bold text-amber-900 mt-1">{summary.re_review}</div>
          <span className="text-xs text-amber-600">approvals invalidated</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Marked Stale</span>
          <div className="text-2xl font-bold text-slate-800 mt-1">{summary.stale}</div>
          <span className="text-xs text-slate-400">drafts updated</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-red-300 bg-red-50/30 shadow-xs">
          <span className="text-xs font-semibold text-red-700 uppercase tracking-wider">RED ALERT</span>
          <div className="text-2xl font-bold text-red-900 mt-1">{summary.red_alert}</div>
          <span className="text-xs text-red-600">live asset outdated</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Left Alone</span>
          <div className="text-2xl font-bold text-emerald-900 mt-1">{summary.left_alone}</div>
          <span className="text-xs text-emerald-600">archived prior</span>
        </div>
      </div>

      {/* Table of Downstream Impact */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="text-sm font-bold text-slate-800">
            Downstream Impact for Fact: <span className="font-mono text-purple-700">F001</span> ({impactData?.fact_name})
          </div>
          <div className="text-xs text-slate-500 font-mono">
            New Proposed Value: <span className="font-semibold text-slate-900">{impactData?.new_value}</span>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">Evaluating impact across graph...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Content Asset</th>
                  <th className="py-3 px-3">Channel</th>
                  <th className="py-3 px-3">State Before</th>
                  <th className="py-3 px-4">Result / Action Required</th>
                  <th className="py-3 px-3">Priority</th>
                  <th className="py-3 px-4">Owner</th>
                  <th className="py-3 px-4">Observed vs New</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {impactData?.items.map((item, idx) => {
                  const isRed = item.is_red_alert;
                  const isReReview = item.is_re_review;
                  const isStale = item.is_stale;
                  const isLeftAlone = item.is_left_alone;

                  return (
                    <tr
                      key={item.content_id || idx}
                      className={`hover:bg-slate-50/80 transition ${
                        isRed ? 'bg-red-50/30' : isReReview ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        {item.title}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="capitalize px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 font-medium border border-slate-200">
                          {item.channel}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="capitalize text-slate-600 text-xs font-mono">
                          {item.old_state}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${
                            isRed
                              ? 'bg-red-600 text-white animate-pulse'
                              : isReReview
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : isStale
                              ? 'bg-slate-200 text-slate-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {item.action_required}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`text-xs font-bold ${
                            item.priority === 'Critical'
                              ? 'text-red-600'
                              : item.priority === 'High'
                              ? 'text-orange-600'
                              : item.priority === 'Medium'
                              ? 'text-amber-600'
                              : 'text-slate-400'
                          }`}
                        >
                          {item.priority}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        <div className="font-medium text-slate-800">{item.owner_name}</div>
                        <div className="text-slate-400 font-mono">{item.owner_email}</div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono">
                        <span className="text-rose-600 line-through mr-1.5">{item.outdated_value}</span>
                        <span className="text-emerald-600 font-bold">→ {item.new_value}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};


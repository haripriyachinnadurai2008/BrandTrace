import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { FactImpactResponse, UserRole } from '../types';
import { GlassCard } from '../components/common/GlassCard';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import { showToast } from '../components/common/Toast';
import {
  DownloadIcon,
  RefreshIcon,
  CheckCircleIcon,
  SparklesIcon,
} from '../components/Icons';

export const ImpactListView: React.FC<{ currentRole: UserRole }> = () => {
  const [impactData, setImpactData] = useState<FactImpactResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [proposedPrice] = useState<string>('₹5,499');

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
    const msg = 'Re-review notifications dispatched to all content owners.';
    setActionMsg(msg);
    showToast({ type: 'success', title: 'Notifications Dispatched', message: msg });
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
    showToast({ type: 'info', title: 'CSV Exported', message: 'Downstream impact report downloaded.' });
  };

  const summary = impactData?.summary || { total: 0, re_review: 0, stale: 0, red_alert: 0, left_alone: 0 };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <GlassCard className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Change-Impact Blast Radius
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>Atomic Cascade</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time downstream blast radius analysis across all marketing collateral before &amp; after fact version mutations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={handleRequestReReviewAll}
            leftIcon={<RefreshIcon className="w-4 h-4" />}
          >
            Request Re-review (All)
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            leftIcon={<DownloadIcon className="w-4 h-4 text-slate-500" />}
          >
            Export CSV
          </Button>
        </div>
      </GlassCard>

      {actionMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center space-x-2 animate-in fade-in">
          <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{actionMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs animate-in fade-in">
          {error}
        </div>
      )}

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <GlassCard className="p-4">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Scanned
          </span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            {summary.total}
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">pinned assets</span>
        </GlassCard>

        <GlassCard className="p-4 border-amber-300/80 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/20">
          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
            Re-review Req
          </span>
          <div className="text-2xl font-black text-amber-900 dark:text-amber-200 mt-1">
            {summary.re_review}
          </div>
          <span className="text-[11px] text-amber-600 dark:text-amber-400">approvals revoked</span>
        </GlassCard>

        <GlassCard className="p-4 border-purple-300/80 dark:border-purple-900/60 bg-purple-50/30 dark:bg-purple-950/20">
          <span className="text-[11px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
            Marked Stale
          </span>
          <div className="text-2xl font-black text-purple-900 dark:text-purple-200 mt-1">
            {summary.stale}
          </div>
          <span className="text-[11px] text-purple-600 dark:text-purple-400">drafts updated</span>
        </GlassCard>

        <GlassCard className="p-4 border-rose-400/80 dark:border-rose-900/80 bg-rose-50/40 dark:bg-rose-950/30">
          <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
            RED ALERT
          </span>
          <div className="text-2xl font-black text-rose-900 dark:text-rose-200 mt-1">
            {summary.red_alert}
          </div>
          <span className="text-[11px] text-rose-600 dark:text-rose-400">live asset outdated</span>
        </GlassCard>

        <GlassCard className="p-4 border-emerald-300/80 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20">
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
            Left Alone
          </span>
          <div className="text-2xl font-black text-emerald-900 dark:text-emerald-200 mt-1">
            {summary.left_alone}
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">archived prior</span>
        </GlassCard>
      </div>

      {/* Table of Downstream Impact */}
      <GlassCard className="overflow-hidden">
        <div className="p-4 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
          <div className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
            Downstream Impact for Fact: <span className="font-mono text-purple-600 dark:text-purple-400 font-bold">F001</span> ({impactData?.fact_name || 'Standard Tier Pricing'})
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            New Proposed Value: <span className="font-bold text-slate-900 dark:text-white">{impactData?.new_value || proposedPrice}</span>
          </div>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            <Skeleton className="h-6 w-full" count={4} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50/60 dark:bg-slate-950/40 text-slate-500 dark:text-slate-400 uppercase text-[11px] font-mono tracking-wider border-b border-slate-200/80 dark:border-slate-800/80">
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
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                {impactData?.items.map((item, idx) => {
                  const isRed = item.is_red_alert;
                  const isReReview = item.is_re_review;
                  const isStale = item.is_stale;

                  return (
                    <tr
                      key={item.content_id || idx}
                      className={`transition-colors ${
                        isRed
                          ? 'bg-rose-500/15 dark:bg-rose-950/30'
                          : isReReview
                          ? 'bg-amber-500/10 dark:bg-amber-950/20'
                          : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                        {item.title}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="capitalize px-2 py-0.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium border border-slate-200 dark:border-slate-700">
                          {item.channel}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="capitalize text-slate-600 dark:text-slate-400 text-xs font-mono">
                          {item.old_state}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isRed
                              ? 'bg-rose-600 text-white animate-pulse shadow-xs shadow-rose-600/30'
                              : isReReview
                              ? 'bg-amber-500/20 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800'
                              : isStale
                              ? 'bg-purple-500/15 text-purple-900 dark:text-purple-200 border border-purple-300 dark:border-purple-800'
                              : 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
                          }`}
                        >
                          {item.action_required}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`text-xs font-bold ${
                            item.priority === 'Critical'
                              ? 'text-rose-600 dark:text-rose-400'
                              : item.priority === 'High'
                              ? 'text-orange-600 dark:text-orange-400'
                              : item.priority === 'Medium'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {item.priority}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{item.owner_name}</div>
                        <div className="text-slate-400 font-mono text-[11px]">{item.owner_email}</div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono">
                        <span className="text-rose-600 dark:text-rose-400 line-through mr-1.5">{item.outdated_value}</span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold">→ {item.new_value}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
};

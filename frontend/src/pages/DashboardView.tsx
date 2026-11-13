import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import { api } from '../api/client';
import { useRouter } from '../router/Router';
import { GlassCard } from '../components/common/GlassCard';
import { Button } from '../components/common/Button';
import { CardSkeleton } from '../components/common/Skeleton';
import {
  ShieldCheckIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  SparklesIcon,
  FileTextIcon,
  GitCommitIcon,
  LayersIcon,
  HistoryIcon,
  RefreshIcon,
  ClockIcon,
  ArrowRightIcon,
  PlusIcon,
} from '../components/Icons';

interface DashboardViewProps {
  currentRole: UserRole;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ currentRole }) => {
  const { navigate } = useRouter();
  const [loading, setLoading] = useState<boolean>(true);
  const [contentItems, setContentItems] = useState<any[]>([]);
  const [expiryData, setExpiryData] = useState<any>(null);
  const [proposedRules, setProposedRules] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [currentRole]);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const itemsPromise = api.getContentItems().catch(() => []);
      const expiryPromise = api.getExpiryForecast().catch(() => null);
      const rulesPromise = currentRole === 'Admin' ? api.getProposedRules().catch(() => []) : Promise.resolve([]);
      const auditPromise = currentRole !== 'Agency' ? api.getAuditLogs().catch(() => []) : Promise.resolve([]);

      const [items, expiry, rules, audits] = await Promise.all([
        itemsPromise,
        expiryPromise,
        rulesPromise,
        auditPromise,
      ]);

      setContentItems(items || []);
      setExpiryData(expiry);
      setProposedRules(rules || []);
      setAuditLogs((audits || []).slice(0, 5));
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  const isAgency = currentRole === 'Agency';
  const isAdmin = currentRole === 'Admin';

  // Compute asset counts
  const totalAssets = contentItems.length;
  const liveCount = contentItems.filter(c => c.current_state === 'live').length;
  const approvedCount = contentItems.filter(c => c.current_state === 'approved').length;
  const reReviewCount = contentItems.filter(c => c.current_state === 're-review required').length;
  const staleCount = contentItems.filter(c => c.current_state === 'draft (stale)').length;
  const draftCount = contentItems.filter(c => c.current_state === 'draft').length;

  const expiringSoonCount = expiryData?.expiring_soon_count || 0;
  const highRiskExpiryCount = expiryData?.high_risk_count || 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <GlassCard className="p-6 relative overflow-hidden border-purple-500/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                Round 3 Production
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                Active Role: <strong className="text-purple-600 dark:text-purple-400">{currentRole}</strong>
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1.5 tracking-tight">
              Brand Governance Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              {isAgency
                ? 'Campaign-scoped view of marketing collateral, approved ground-truth claims, and living compliance standards for Festive Launch.'
                : 'Real-time ground-truth health, downstream cascade monitor, expiry forecasting, and institutional living guidelines.'}
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={loadDashboardData}
              isLoading={loading}
              leftIcon={<RefreshIcon className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>
            {!isAgency && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/app/findings')}
                leftIcon={<PlusIcon className="w-4 h-4" />}
              >
                Verify New Asset
              </Button>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Top 4 Primary KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Active Marketing Assets */}
        <GlassCard className="p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Managed Assets
            </span>
            <FileTextIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-slate-900 dark:text-white">
              {loading ? '...' : totalAssets}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{liveCount} Live</span>
              <span>·</span>
              <span className="text-purple-600 dark:text-purple-400 font-semibold">{approvedCount} Approved</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/app/findings')}
            className="mt-4 text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1 hover:underline"
          >
            <span>View all assets</span>
            <ArrowRightIcon className="w-3 h-3" />
          </button>
        </GlassCard>

        {/* KPI 2: Truth Graph Expiry Risk */}
        <GlassCard className="p-5 flex flex-col justify-between border-amber-300/40 dark:border-amber-800/40 bg-amber-50/20 dark:bg-amber-950/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              Expiring Facts (&lt;30d)
            </span>
            <ClockIcon className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-amber-900 dark:text-amber-200">
              {loading ? '...' : expiringSoonCount}
            </div>
            <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              {highRiskExpiryCount > 0 ? (
                <span className="font-bold text-rose-600 dark:text-rose-400">
                  {highRiskExpiryCount} high risk (&lt;14 days)
                </span>
              ) : (
                'No critical expiries'
              )}
            </div>
          </div>
          <button
            onClick={() => navigate('/app/facts')}
            className="mt-4 text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1 hover:underline"
          >
            <span>Inspect timeline</span>
            <ArrowRightIcon className="w-3 h-3" />
          </button>
        </GlassCard>

        {/* KPI 3: Re-Review & Stale Alerts */}
        <GlassCard className="p-5 flex flex-col justify-between border-orange-300/40 dark:border-orange-800/40 bg-orange-50/20 dark:bg-orange-950/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-orange-800 dark:text-orange-300">
              Blast Radius Invalidation
            </span>
            <AlertTriangleIcon className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-orange-900 dark:text-orange-200">
              {loading ? '...' : reReviewCount + staleCount}
            </div>
            <div className="text-xs text-orange-700 dark:text-orange-300 mt-1">
              <span>{reReviewCount} re-review</span> · <span>{staleCount} stale</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/app/impact')}
            className="mt-4 text-xs font-semibold text-orange-700 dark:text-orange-300 flex items-center gap-1 hover:underline"
          >
            <span>Inspect blast radius</span>
            <ArrowRightIcon className="w-3 h-3" />
          </button>
        </GlassCard>

        {/* KPI 4: Living Rules / Institutional Memory */}
        <GlassCard className="p-5 flex flex-col justify-between border-emerald-300/40 dark:border-emerald-800/40 bg-emerald-50/20 dark:bg-emerald-950/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
              {isAdmin ? 'Proposed Rules' : 'Living Guidelines'}
            </span>
            <SparklesIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-emerald-900 dark:text-emerald-200">
              {loading ? '...' : isAdmin ? proposedRules.length : 'Active'}
            </div>
            <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
              {isAdmin
                ? proposedRules.length > 0
                  ? `${proposedRules.length} synthesized awaiting Admin approval`
                  : 'All proposed rules approved'
                : 'Rule engine active across findings'}
            </div>
          </div>
          <button
            onClick={() => navigate('/app/precedents')}
            className="mt-4 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 hover:underline"
          >
            <span>Open synthesizer</span>
            <ArrowRightIcon className="w-3 h-3" />
          </button>
        </GlassCard>
      </div>

      {/* Expiry Forecasting Alert Banner */}
      {expiryData?.items && expiryData.items.length > 0 && (
        <GlassCard className="p-4 border-amber-300/80 dark:border-amber-800/80 bg-amber-500/10 dark:bg-amber-950/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <ClockIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200">
                  Ground-Truth Expiry Watch: {expiryData.items[0].fact_id} ({expiryData.items[0].fact_name})
                </h4>
                <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-0.5">
                  Valid until {new Date(expiryData.items[0].valid_to).toLocaleDateString()} ·{' '}
                  <strong>{expiryData.items[0].days_remaining} days remaining</strong> · Affects{' '}
                  <strong>{expiryData.items[0].affected_assets_count} marketing collateral piece(s)</strong>.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/app/facts')}
              className="border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 shrink-0"
            >
              Manage in Truth Graph
            </Button>
          </div>
        </GlassCard>
      )}

      {/* Two Column Layout: Asset Matrix + Recent Audit Trail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Managed Assets Status Matrix */}
        <div className="lg:col-span-7 space-y-4">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileTextIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Marketing Collateral Pipeline
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">Campaign: Festive Launch</span>
            </div>

            {loading ? (
              <div className="py-6 space-y-3">
                <CardSkeleton rows={3} />
              </div>
            ) : contentItems.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                No collateral registered yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60 mt-2">
                {contentItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => navigate('/app/findings')}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-900/40 px-2 rounded-lg cursor-pointer transition"
                  >
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="capitalize font-mono">{item.channel}</span>
                        <span>·</span>
                        <span>v{item.current_version?.version_no || 1}</span>
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${
                        item.current_state === 'live'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          : item.current_state === 'approved'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                          : item.current_state === 're-review required'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse'
                          : item.current_state === 'draft (stale)'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {item.current_state}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => navigate('/app/findings')}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 hover:bg-purple-50 dark:hover:bg-purple-950/30 text-left transition"
            >
              <FileTextIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 mb-1.5" />
              <div className="text-xs font-bold text-slate-900 dark:text-white">Verify Copy</div>
              <div className="text-[10px] text-slate-400">Deterministic check</div>
            </button>

            <button
              onClick={() => navigate('/app/facts')}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 hover:bg-purple-50 dark:hover:bg-purple-950/30 text-left transition"
            >
              <GitCommitIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 mb-1.5" />
              <div className="text-xs font-bold text-slate-900 dark:text-white">Truth Graph</div>
              <div className="text-[10px] text-slate-400">What-If &amp; versions</div>
            </button>

            <button
              onClick={() => navigate('/app/campaigns')}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 hover:bg-purple-50 dark:hover:bg-purple-950/30 text-left transition"
            >
              <LayersIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 mb-1.5" />
              <div className="text-xs font-bold text-slate-900 dark:text-white">Coherence</div>
              <div className="text-[10px] text-slate-400">Semantic conflicts</div>
            </button>

            <button
              onClick={() => navigate('/app/precedents')}
              className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 hover:bg-purple-50 dark:hover:bg-purple-950/30 text-left transition"
            >
              <HistoryIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 mb-1.5" />
              <div className="text-xs font-bold text-slate-900 dark:text-white">Synthesizer</div>
              <div className="text-[10px] text-slate-400">Living guidelines</div>
            </button>
          </div>
        </div>

        {/* Right 5 Cols: Trigger-Enforced Audit Feed */}
        <div className="lg:col-span-5 space-y-4">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Audit Trail Ledger
                </h3>
              </div>
              <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                Trigger Enforced
              </span>
            </div>

            {loading ? (
              <div className="py-6 space-y-3">
                <CardSkeleton rows={3} />
              </div>
            ) : isAgency ? (
              <div className="text-center py-8 text-xs text-slate-500">
                Audit trail access is restricted to internal governance roles (Admin / Reviewer).
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                No audit entries recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60 mt-2 space-y-1">
                {auditLogs.map((log: any, idx: number) => (
                  <div key={log.id || idx} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                        {log.action}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {log.created_at ? new Date(log.created_at).toLocaleTimeString() : 'IST'}
                      </span>
                    </div>
                    <div className="text-slate-700 dark:text-slate-300 mt-1 font-medium truncate">
                      {log.entity_type}: <span className="font-mono text-slate-500">{log.entity_id}</span>
                    </div>
                    {log.reason && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 italic truncate mt-0.5">
                        &quot;{log.reason}&quot;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!isAgency && (
              <button
                onClick={() => navigate('/app/audit')}
                className="mt-4 w-full py-2 text-center text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30 rounded-lg transition"
              >
                View complete append-only audit trail →
              </button>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { api, isPermissionError } from '../api/client';
import { Guideline, Precedent, ProposedRule, UserRole } from '../types';
import { useRouter } from '../router/Router';
import { GlassCard } from '../components/common/GlassCard';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import { RoleRestrictedCard } from '../components/common/RoleRestrictedCard';
import { ErrorRetryCard } from '../components/common/ErrorRetryCard';
import { showToast } from '../components/common/Toast';
import {
  HistoryIcon,
  CheckCircleIcon,
  RefreshIcon,
  SparklesIcon,
  ShieldCheckIcon,
  CheckIcon,
  XIcon,
  LockIcon,
} from '../components/Icons';

export const PrecedentsView: React.FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const { navigate } = useRouter();
  const [precedents, setPrecedents] = useState<Precedent[]>([]);
  const [proposedRules, setProposedRules] = useState<ProposedRule[]>([]);
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState<boolean>(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [editedPolicy, setEditedPolicy] = useState<Record<string, string>>({});

  const isAdmin = currentRole === 'Admin';
  const canViewGuidelines = currentRole === 'Admin' || currentRole === 'Creator' || currentRole === 'Reviewer';

  useEffect(() => {
    loadAll();
  }, [currentRole]);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      setForbidden(false);

      const precPromise = api.getPrecedents();
      const proposedPromise = isAdmin
        ? api.getProposedRules().catch(() => [])
        : Promise.resolve<ProposedRule[]>([]);
      const guidelinesPromise = canViewGuidelines
        ? api.getActiveGuidelines(true).catch(() => [])
        : Promise.resolve<Guideline[]>([]);

      const [precData, proposedData, guidelinesData] = await Promise.all([
        precPromise,
        proposedPromise,
        guidelinesPromise,
      ]);

      setPrecedents(precData || []);
      setProposedRules(proposedData || []);
      setGuidelines(guidelinesData || []);
    } catch (err: any) {
      if (isPermissionError(err)) {
        setForbidden(true);
        setError(null);
      } else {
        setError(err.message || 'Failed to load precedents and living guidelines');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRule = async (rule: ProposedRule) => {
    if (!isAdmin) return;
    try {
      setDecidingId(rule.id);
      const customText = editedPolicy[rule.id]?.trim();
      await api.approveProposedRule(rule.id, {
        policy_text: customText || rule.suggested_policy_text,
      });
      showToast({
        type: 'success',
        title: 'Rule Approved',
        message: `"${rule.title}" added to Active Living Guidelines.`,
      });
      await loadAll();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Approval Failed',
        message: err.message || 'Could not approve proposed rule',
      });
    } finally {
      setDecidingId(null);
    }
  };

  const handleRejectRule = async (rule: ProposedRule) => {
    if (!isAdmin) return;
    try {
      setDecidingId(rule.id);
      await api.rejectProposedRule(rule.id, {
        reason: `Rejected proposed rule '${rule.title}' during Admin review`,
      });
      showToast({
        type: 'info',
        title: 'Rule Rejected',
        message: `"${rule.title}" marked rejected and logged to audit trail.`,
      });
      await loadAll();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Rejection Failed',
        message: err.message || 'Could not reject proposed rule',
      });
    } finally {
      setDecidingId(null);
    }
  };

  // Group precedents by rule_id
  const groupedByRule = precedents.reduce<Record<string, Precedent[]>>((acc, p) => {
    const key = p.rule_id || 'General Brand Guidelines';
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const ruleKeys = Object.keys(groupedByRule);
  const pendingProposed = proposedRules.filter(r => r.status === 'proposed');

  if (forbidden) {
    return (
      <div className="space-y-6">
        <GlassCard className="p-5">
          <div className="flex items-center space-x-2">
            <HistoryIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Living Guidelines &amp; Precedent Synthesizer
            </h1>
          </div>
        </GlassCard>
        <RoleRestrictedCard
          currentRole={currentRole}
          featureTitle="Living Guidelines Precedents"
          allowedRolesLabel="Admin, Creator, Reviewer"
          onGoBack={() => navigate('/app/findings')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <GlassCard className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center flex-wrap gap-2">
            <HistoryIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Living Guidelines &amp; Precedent Synthesizer
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>Precedent-to-Rule Engine</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            When 3+ similar reviewer overrides accumulate, BrandTrace synthesizes a Proposed Rule for Admin sign-off into versioned Active Guidelines.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100/80 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
            Precedents: <strong className="text-purple-600 dark:text-purple-400">{precedents.length}</strong>
          </div>
          {canViewGuidelines && (
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-300/40 dark:border-emerald-800/60">
              Active Rules: <strong className="text-emerald-600 dark:text-emerald-400">{guidelines.length}</strong>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
            disabled={loading}
            isLoading={loading}
            leftIcon={<RefreshIcon className="w-4 h-4 text-slate-500" />}
          >
            Refresh
          </Button>
        </div>
      </GlassCard>

      {error && (
        <ErrorRetryCard
          title="Could not load precedents and rules"
          message={error}
          onRetry={loadAll}
          retrying={loading}
        />
      )}

      {loading ? (
        <div className="p-8 space-y-4">
          <Skeleton className="h-24 w-full" count={2} />
        </div>
      ) : (
        <>
          {/* SECTION 1: Proposed Rules (Admin approval queue) */}
          <GlassCard className="p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Proposed Rules ({isAdmin ? proposedRules.length : 'Admin Queue'})
                </h2>
                {isAdmin && pendingProposed.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-400/50">
                    {pendingProposed.length} awaiting Admin decision
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400">Threshold: 3+ similar precedents</span>
            </div>

            {!isAdmin ? (
              <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2.5">
                <LockIcon className="w-4 h-4 text-purple-500 shrink-0" />
                <span>
                  Proposed Rules synthesized from repeated reviewer overrides appear in the <strong>Admin</strong> approval queue. Once approved by an Admin, they publish below under Active Guidelines.
                </span>
              </div>
            ) : proposedRules.length === 0 ? (
              <div className="p-5 rounded-xl bg-slate-100/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 text-center">
                No Proposed Rules synthesized yet. Dismiss 1 additional similar finding as <strong>Reviewer</strong> (3 total in the same cluster) to synthesize a Proposed Rule here.
              </div>
            ) : (
              <div className="space-y-4">
                {proposedRules.map(rule => {
                  const isPending = rule.status === 'proposed';
                  const isBusy = decidingId === rule.id;
                  const draftPolicy = editedPolicy[rule.id] ?? rule.suggested_policy_text;

                  return (
                    <div
                      key={rule.id}
                      className={`p-4 sm:p-5 rounded-xl border space-y-3 transition ${
                        isPending
                          ? 'border-purple-400/60 dark:border-purple-700/70 bg-purple-500/5'
                          : rule.status === 'approved'
                          ? 'border-emerald-400/40 dark:border-emerald-800/60 bg-emerald-500/5'
                          : 'border-slate-300 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-950/40 opacity-80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold uppercase bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-400/40">
                              {rule.finding_type}
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                                rule.status === 'approved'
                                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-400/40'
                                  : rule.status === 'rejected'
                                  ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-400/40'
                                  : 'bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-400/40'
                              }`}
                            >
                              {rule.status}
                            </span>
                          </div>
                          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                            {rule.title}
                          </h3>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {rule.description}
                          </p>
                        </div>

                        {isPending && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleApproveRule(rule)}
                              disabled={isBusy}
                              isLoading={isBusy}
                              leftIcon={<CheckIcon className="w-4 h-4" />}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleRejectRule(rule)}
                              disabled={isBusy}
                              leftIcon={<XIcon className="w-4 h-4 text-rose-400" />}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Policy Text (editable before Admin approves) */}
                      <div className="space-y-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Suggested Guideline Policy Text
                        </div>
                        {isPending ? (
                          <textarea
                            rows={2}
                            value={draftPolicy}
                            onChange={e =>
                              setEditedPolicy(prev => ({ ...prev, [rule.id]: e.target.value }))
                            }
                            className="w-full p-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white/90 dark:bg-slate-950/80 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        ) : (
                          <div className="p-3 rounded-xl bg-white/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
                            {rule.suggested_policy_text}
                          </div>
                        )}
                      </div>

                      {/* Supporting Precedents */}
                      <div className="space-y-1.5 pt-1">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Supporting Precedents ({rule.supporting_precedents.length})
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          {rule.supporting_precedents.map(sp => (
                            <div
                              key={sp.id}
                              className="p-2.5 rounded-lg bg-white/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1"
                            >
                              <div className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-2">
                                {sp.finding_summary}
                              </div>
                              <div className="text-purple-700 dark:text-purple-300 line-clamp-2">
                                Rationale: &quot;{sp.reason}&quot;
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>

          {/* SECTION 2: Active Versioned Guidelines */}
          {canViewGuidelines && (
            <GlassCard className="p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="w-5 h-5 text-emerald-500" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Active Guidelines ({guidelines.length})
                  </h2>
                </div>
                <span className="text-xs text-slate-400">Versioned institutional rules applied on verification</span>
              </div>

              {guidelines.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-100/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 text-center">
                  No Active Guidelines published yet. Approve a Proposed Rule above to activate v1.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {guidelines.map(g => (
                    <div
                      key={g.id}
                      className="p-4 rounded-xl border border-emerald-400/40 dark:border-emerald-800/60 bg-emerald-500/5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md text-xs font-mono font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-400/40">
                            v{g.version}
                          </span>
                          {g.finding_type && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono uppercase bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {g.finding_type}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {g.active ? '● Active' : 'Superseded'}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {g.title || g.rule_id}
                      </h3>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {g.text}
                      </p>
                      <div className="text-[11px] font-mono text-slate-400">
                        Activated: {new Date(g.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}

          {/* SECTION 3: Precedents Ledger */}
          {ruleKeys.length === 0 ? (
            <GlassCard className="p-12 text-center text-slate-500 dark:text-slate-400">
              <CheckCircleIcon className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="font-bold text-slate-800 dark:text-slate-200">
                {currentRole === 'Agency'
                  ? 'No campaign-linked precedents on record.'
                  : 'No reviewer overrides on record.'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {currentRole === 'Agency'
                  ? 'Precedents linked to findings in your assigned campaign appear here once recorded.'
                  : 'When a reviewer dismisses or overrides a finding with a justification, it automatically appears here.'}
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
                            <div className="flex items-center flex-wrap gap-2">
                              <span className="px-2.5 py-0.5 rounded-full text-xs uppercase tracking-wider font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                                {p.resolution_action}
                              </span>
                              {p.finding_type && (
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono uppercase bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-300/40 dark:border-purple-800/60">
                                  {p.finding_type}
                                </span>
                              )}
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
        </>
      )}
    </div>
  );
};

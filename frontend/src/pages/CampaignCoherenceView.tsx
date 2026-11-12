import React, { useState, useEffect } from 'react';
import { api, isPermissionError } from '../api/client';
import { Campaign, CoherenceFinding, SemanticConflict, UserRole } from '../types';
import { useRouter } from '../router/Router';
import { GlassCard } from '../components/common/GlassCard';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import { RoleRestrictedCard } from '../components/common/RoleRestrictedCard';
import { ErrorRetryCard } from '../components/common/ErrorRetryCard';
import { showToast } from '../components/common/Toast';
import {
  LayersIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  RefreshIcon,
  SparklesIcon,
  CheckIcon,
  XIcon,
} from '../components/Icons';

export const CampaignCoherenceView: React.FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const { navigate } = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'numeric' | 'semantic'>('semantic');

  // Numeric findings state
  const [coherenceFindings, setCoherenceFindings] = useState<CoherenceFinding[]>([]);
  const [checkingNumeric, setCheckingNumeric] = useState<boolean>(false);
  const [lastCheckStats, setLastCheckStats] = useState<string | null>(null);

  // Semantic findings state
  const [semanticConflicts, setSemanticConflicts] = useState<SemanticConflict[]>([]);
  const [checkingSemantic, setCheckingSemantic] = useState<boolean>(false);
  const [semanticFallbackUsed, setSemanticFallbackUsed] = useState<boolean>(false);
  const [semanticAiLabel, setSemanticAiLabel] = useState<string>('');
  const [semanticStats, setSemanticStats] = useState<string | null>(null);
  const [dismissModalConflict, setDismissModalConflict] = useState<SemanticConflict | null>(null);
  const [dismissReason, setDismissReason] = useState<string>('');
  const [dismissSubmitting, setDismissSubmitting] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState<boolean>(false);

  const isPermitted = currentRole !== 'Agency';
  const canDecide = currentRole === 'Admin' || currentRole === 'Reviewer';

  useEffect(() => {
    if (!isPermitted) {
      setCampaigns([]);
      setSelectedCampaignId('');
      setCoherenceFindings([]);
      setSemanticConflicts([]);
      setError(null);
      setForbidden(false);
      setLastCheckStats(null);
      setSemanticStats(null);
      return;
    }
    loadCampaigns();
  }, [currentRole, isPermitted]);

  useEffect(() => {
    if (selectedCampaignId && isPermitted) {
      loadCampaignData(selectedCampaignId);
    }
  }, [selectedCampaignId, isPermitted]);

  const loadCampaigns = async () => {
    if (!isPermitted) return;
    try {
      setLoading(true);
      setError(null);
      setForbidden(false);
      const data = await api.getCampaigns();
      setCampaigns(data || []);
      if (data && data.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(data[0].id);
      }
    } catch (err: any) {
      if (isPermissionError(err)) {
        setForbidden(true);
        setError(null);
      } else {
        setError(err.message || 'Failed to load campaigns');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCampaignData = async (cid: string) => {
    await Promise.all([
      handleCheckNumeric(cid, false),
      loadExistingSemanticConflicts(cid),
    ]);
  };

  const handleCheckNumeric = async (targetId?: string, notify: boolean = true) => {
    const cid = targetId || selectedCampaignId;
    if (!cid || !isPermitted) return;
    try {
      setCheckingNumeric(true);
      setError(null);
      setForbidden(false);
      const res = await api.checkCampaignCoherence(cid);
      setCoherenceFindings(res.findings || []);
      const msg = res.has_contradictions
        ? `Detected ${res.findings_count} numeric cross-channel contradiction(s).`
        : 'All channels coherent. No offer contradictions.';
      setLastCheckStats(msg);
      if (notify) {
        if (res.has_contradictions) {
          showToast({ type: 'warning', title: 'Coherence Conflict', message: msg });
        } else {
          showToast({ type: 'success', title: 'Coherence Verified', message: msg });
        }
      }
    } catch (err: any) {
      if (isPermissionError(err)) {
        setForbidden(true);
        setError(null);
      } else {
        const msg = err.message || 'Campaign coherence check failed';
        setError(msg);
        showToast({ type: 'error', title: 'Check Failed', message: msg });
      }
    } finally {
      setCheckingNumeric(false);
    }
  };

  const loadExistingSemanticConflicts = async (cid: string) => {
    try {
      const res = await api.getSemanticConflicts(cid);
      setSemanticConflicts(res.conflicts || []);
      setSemanticFallbackUsed(Boolean(res.fallback_used));
      setSemanticAiLabel(res.fallback_used ? 'AI unavailable, using rule-based check' : 'Groq LLM Verified');
      if (res.conflicts && res.conflicts.length > 0) {
        setSemanticStats(`Found ${res.conflicts_count} semantic contradiction(s) across channels.`);
      } else {
        setSemanticStats('No semantic conflicts recorded yet. Click "Run semantic check" to scan.');
      }
    } catch {
      // Ignored for initial load
    }
  };

  const handleRunSemanticCheck = async () => {
    if (!selectedCampaignId || !isPermitted) return;
    try {
      setCheckingSemantic(true);
      setError(null);
      setForbidden(false);
      const res = await api.runSemanticCheck(selectedCampaignId);
      setSemanticConflicts(res.conflicts || []);
      setSemanticFallbackUsed(Boolean(res.fallback_used));
      setSemanticAiLabel(res.ai_label || (res.fallback_used ? 'AI unavailable, using rule-based check' : 'Groq LLM Verified'));
      const msg = res.conflicts_count > 0
        ? `Detected ${res.conflicts_count} semantic contradiction(s) with no shared numbers.`
        : 'No semantic contradictions detected across channels.';
      setSemanticStats(msg);
      if (res.conflicts_count > 0) {
        showToast({ type: 'warning', title: 'Semantic Conflicts Found', message: msg });
      } else {
        showToast({ type: 'success', title: 'Semantic Coherence Verified', message: msg });
      }
    } catch (err: any) {
      if (isPermissionError(err)) {
        setForbidden(true);
        setError(null);
      } else {
        const msg = err.message || 'Semantic check failed';
        setError(msg);
        showToast({ type: 'error', title: 'Semantic Check Error', message: msg });
      }
    } finally {
      setCheckingSemantic(false);
    }
  };

  const handleOpenDismissModal = (conflict: SemanticConflict) => {
    setDismissModalConflict(conflict);
    setDismissReason('');
  };

  const handleSubmitDismiss = async () => {
    if (!dismissModalConflict || dismissReason.trim().length < 10) return;
    try {
      setDismissSubmitting(true);
      const res = await api.dismissSemanticConflict(dismissModalConflict.id, dismissReason.trim());
      showToast({
        type: 'success',
        title: 'Conflict Dismissed',
        message: 'Saved to precedents ledger & audit trail.',
      });
      if (res.proposed_rules_created && res.proposed_rules_created.length > 0) {
        showToast({
          type: 'info',
          title: 'Proposed Rule Synthesized',
          message: `Created proposed rule "${res.proposed_rules_created[0].title}" in Precedents for Admin review.`,
        });
      }
      setDismissModalConflict(null);
      setDismissReason('');
      if (selectedCampaignId) {
        loadExistingSemanticConflicts(selectedCampaignId);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to dismiss conflict';
      showToast({ type: 'error', title: 'Dismiss Failed', message: msg });
    } finally {
      setDismissSubmitting(false);
    }
  };

  const handleApproveFix = async (conflict: SemanticConflict) => {
    try {
      await api.approveSemanticConflict(conflict.id, 'Approved alignment fix across channels');
      showToast({
        type: 'success',
        title: 'Fix Approved',
        message: 'Marked conflict resolution as approved in audit trail.',
      });
      if (selectedCampaignId) {
        loadExistingSemanticConflicts(selectedCampaignId);
      }
    } catch (err: any) {
      const msg = err.message || 'Failed to approve fix';
      showToast({ type: 'error', title: 'Approval Failed', message: msg });
    }
  };

  const currentCamp = campaigns.find(c => c.id === selectedCampaignId);

  if (!isPermitted || forbidden) {
    return (
      <div className="space-y-6">
        <GlassCard className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <LayersIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
                Campaign Coherence Engine
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Cross-channel contradiction detector across internal marketing channels.
            </p>
          </div>
        </GlassCard>

        <RoleRestrictedCard
          currentRole={currentRole}
          featureTitle="Campaign Coherence Checker"
          allowedRolesLabel="Admin, Creator, Reviewer"
          reason="Cross-channel campaign coherence scans compare internal BrandTrace assets across all channels and are restricted for Agency accounts."
          onGoBack={() => navigate('/app/findings')}
        />
      </div>
    );
  }

  const openSemanticCount = semanticConflicts.filter(c => c.status === 'open').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <GlassCard className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <LayersIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Campaign Coherence Engine
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>Cross-Channel &amp; Semantic</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Detects contradictory discount values, shipping terms, availability windows, and eligibility claims across channels.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            disabled={loading || campaigns.length === 0}
            className="text-xs sm:text-sm border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium disabled:opacity-60"
          >
            {campaigns.length === 0 ? (
              <option value="" disabled className="bg-white dark:bg-slate-900">
                {loading ? 'Loading campaigns...' : 'No campaigns found'}
              </option>
            ) : (
              campaigns.map(c => (
                <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900">
                  {c.name} ({c.status})
                </option>
              ))
            )}
          </select>

          {activeTab === 'semantic' ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleRunSemanticCheck}
              disabled={checkingSemantic || !selectedCampaignId}
              isLoading={checkingSemantic}
              leftIcon={<SparklesIcon className="w-4 h-4" />}
            >
              {checkingSemantic ? 'Scanning semantics...' : 'Run semantic check'}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleCheckNumeric()}
              disabled={checkingNumeric || !selectedCampaignId}
              isLoading={checkingNumeric}
              leftIcon={<RefreshIcon className="w-4 h-4" />}
            >
              {checkingNumeric ? 'Analyzing...' : 'Check numeric'}
            </Button>
          )}
        </div>
      </GlassCard>

      {error && (
        <ErrorRetryCard
          title="Could not analyze campaign coherence"
          message={error}
          onRetry={() => (selectedCampaignId ? loadCampaignData(selectedCampaignId) : loadCampaigns())}
          retrying={loading || checkingNumeric || checkingSemantic}
        />
      )}

      {/* Tabs navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4">
        <button
          onClick={() => setActiveTab('semantic')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'semantic'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <SparklesIcon className="w-4 h-4" />
          <span>Semantic Contradictions</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            {openSemanticCount} open
          </span>
          {semanticFallbackUsed && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              AI unavailable, using rule-based check
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('numeric')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'numeric'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <LayersIcon className="w-4 h-4" />
          <span>Numeric Conflicts</span>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {coherenceFindings.length}
          </span>
        </button>
      </div>

      {/* Campaign Baseline Card */}
      <GlassCard className="p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Campaign Baseline Offer
          </span>
          <span className="text-xs font-mono px-2.5 py-0.5 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-full font-semibold">
            Single Source of Truth
          </span>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">{currentCamp?.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{currentCamp?.description || 'Active promotional campaign'}</p>
          </div>
          <div className="sm:text-right">
            <span className="text-xs text-slate-400 block mb-1">Approved Campaign Offer:</span>
            <span className="text-sm sm:text-base font-bold text-purple-700 dark:text-purple-300 font-mono bg-purple-500/10 px-3 py-1.5 rounded-xl border border-purple-300 dark:border-purple-800">
              {currentCamp?.approved_offer || 'None specified'}
            </span>
          </div>
        </div>
      </GlassCard>

      {/* TAB CONTENT: SEMANTIC */}
      {activeTab === 'semantic' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Semantic Campaign Conflicts ({semanticConflicts.length})
              </h2>
              <span className="text-xs text-slate-500">Cross-channel pairs with no matching numbers</span>
            </div>
            {semanticFallbackUsed && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>AI unavailable, using rule-based check</span>
              </span>
            )}
          </div>

          {checkingSemantic ? (
            <GlassCard className="p-8">
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 text-purple-600 dark:text-purple-400 text-sm font-bold">
                  <RefreshIcon className="w-5 h-5 animate-spin" />
                  <span>Token-masking copy &amp; evaluating cross-channel semantics with LLM...</span>
                </div>
                <Skeleton className="h-24 w-full" count={2} />
              </div>
            </GlassCard>
          ) : semanticConflicts.length === 0 ? (
            <GlassCard className="py-12 text-center text-slate-500 dark:text-slate-400">
              <CheckCircleIcon className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="font-bold text-slate-800 dark:text-slate-200">No semantic conflicts found.</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                All marketing channels align on shipping policy, eligibility terms, availability, and non-numeric claims.
              </p>
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRunSemanticCheck}
                  leftIcon={<SparklesIcon className="w-4 h-4" />}
                >
                  Run semantic check
                </Button>
              </div>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {semanticConflicts.map(c => {
                const isDismissed = c.status === 'dismissed';
                const isApproved = c.status === 'approved';
                return (
                  <GlassCard key={c.id} className="p-5 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 uppercase font-mono">
                          {c.category} contradiction
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          Confidence: {(c.confidence * 100).toFixed(0)}%
                        </span>
                        {c.fallback_used && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
                            Rule-based
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isDismissed ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            Dismissed Exception
                          </span>
                        ) : isApproved ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            Fix Approved
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            Open Conflict
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                      {c.reason}
                    </p>

                    {/* Side-by-side snippet comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      <div className="p-3.5 rounded-xl bg-purple-500/5 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/60">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-bold text-purple-900 dark:text-purple-300">{c.asset_a_title}</span>
                          <span className="font-mono text-[11px] px-2 py-0.5 bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-200 rounded-md">
                            Channel: {c.channel_a}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm font-mono text-slate-900 dark:text-slate-100 bg-white/70 dark:bg-slate-900/70 p-2.5 rounded-lg border border-purple-200/60 dark:border-purple-800/40">
                          &quot;{c.snippet_a}&quot;
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-rose-500/5 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/60">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-bold text-rose-900 dark:text-rose-300">{c.asset_b_title}</span>
                          <span className="font-mono text-[11px] px-2 py-0.5 bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 rounded-md">
                            Channel: {c.channel_b}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm font-mono text-slate-900 dark:text-slate-100 bg-white/70 dark:bg-slate-900/70 p-2.5 rounded-lg border border-rose-200/60 dark:border-rose-800/40">
                          &quot;{c.snippet_b}&quot;
                        </p>
                      </div>
                    </div>

                    {c.decision_reason && (
                      <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-900/70 text-xs text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                        <strong>Decision note:</strong> {c.decision_reason}
                      </div>
                    )}

                    {/* Action buttons (Admin, Reviewer only) */}
                    {c.status === 'open' && (
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                        {canDecide ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDismissModal(c)}
                              leftIcon={<XIcon className="w-3.5 h-3.5" />}
                            >
                              Dismiss (with justification)
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleApproveFix(c)}
                              leftIcon={<CheckIcon className="w-3.5 h-3.5 text-emerald-600" />}
                            >
                              Approve fix
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            Read-only: only Admin and Reviewer can approve or dismiss semantic conflicts.
                          </span>
                        )}
                      </div>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: NUMERIC */}
      {activeTab === 'numeric' && (
        <GlassCard className="overflow-hidden">
          <div className="p-4 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
              Cross-Channel Coherence Findings ({coherenceFindings.length})
            </span>
            <span className="text-xs text-slate-400">Deterministic Pairwise &amp; Attribute Match</span>
          </div>

          {checkingNumeric ? (
            <div className="p-8 space-y-3">
              <Skeleton className="h-6 w-full" count={3} />
            </div>
          ) : coherenceFindings.length === 0 ? (
            <div className="py-12 text-center text-slate-500 dark:text-slate-400">
              <CheckCircleIcon className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="font-bold text-slate-800 dark:text-slate-200">No cross-channel contradictions detected.</p>
              <p className="text-xs text-slate-400 mt-1">
                Click &quot;Check numeric&quot; to scan all assets in this campaign for conflicting values.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
              {coherenceFindings.map((cf, idx) => (
                <div key={idx} className="p-4 sm:p-5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center space-x-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-500/15 text-orange-800 dark:text-orange-300 border border-orange-300 dark:border-orange-800">
                        High Tier Conflict
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">{cf.content_title}</span>
                      <span className="text-xs font-mono px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md border border-slate-200 dark:border-slate-700">
                        Channel: {cf.channel}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-bold text-rose-700 dark:text-rose-300 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-300 dark:border-rose-800">
                      Contradicting Value: {cf.this_value}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-2.5 font-medium leading-relaxed">{cf.reason}</p>

                  <div className="mt-3 p-3 bg-slate-100/60 dark:bg-slate-950/60 rounded-xl text-xs text-slate-600 dark:text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-slate-200/80 dark:border-slate-800">
                    <span>Subject: <strong className="text-slate-800 dark:text-slate-200">{cf.subject}</strong> · Attribute: <strong className="text-slate-800 dark:text-slate-200">{cf.attribute}</strong></span>
                    <span>Conflicting Values Detected: <strong className="text-purple-600 dark:text-purple-400 font-mono">[{cf.all_values.join(', ')}]</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* Dismiss with Justification Modal */}
      {dismissModalConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <GlassCard intensity="prominent" className="max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Dismiss Semantic Conflict
              </h3>
              <button
                onClick={() => setDismissModalConflict(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <div><strong>Category:</strong> {dismissModalConflict.category}</div>
              <div><strong>Channels:</strong> {dismissModalConflict.channel_a} vs {dismissModalConflict.channel_b}</div>
              <div><strong>Reason:</strong> {dismissModalConflict.reason}</div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Override Justification (Required &gt;= 10 chars)
              </label>
              <textarea
                rows={3}
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                placeholder="Explain why this channel difference is an acceptable promotional exception (feeds living guidelines)..."
                className="w-full text-xs border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 bg-white/80 dark:bg-slate-950/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                <span>{dismissReason.trim().length} / 10 characters</span>
                {dismissReason.trim().length > 0 && dismissReason.trim().length < 10 && (
                  <span className="text-rose-500">Minimum 10 non-whitespace characters required</span>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDismissModalConflict(null)}
                disabled={dismissSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmitDismiss}
                disabled={dismissSubmitting || dismissReason.trim().length < 10}
                isLoading={dismissSubmitting}
              >
                Confirm Dismissal &amp; Log Precedent
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};

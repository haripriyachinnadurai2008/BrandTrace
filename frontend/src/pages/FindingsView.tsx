import React, { useState, useEffect } from 'react';
import { api, isPermissionError } from '../api/client';
import { ContentItem, Finding, ContentCheckResult, UserRole } from '../types';
import { useRouter } from '../router/Router';
import { TierBadge, StatusBadge, ConfidenceBar } from '../components/Badges';
import { GlassCard } from '../components/common/GlassCard';
import { Button } from '../components/common/Button';
import { CardSkeleton } from '../components/common/Skeleton';
import { ErrorRetryCard } from '../components/common/ErrorRetryCard';
import { RoleRestrictedCard } from '../components/common/RoleRestrictedCard';
import { showToast } from '../components/common/Toast';
import {
  ShieldCheckIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  RefreshIcon,
  SparklesIcon,
  FileTextIcon,
  CheckIcon,
} from '../components/Icons';

type CheckMeta = {
  ai_unavailable?: boolean;
  ai_label?: string;
  extraction_source?: ContentCheckResult['extraction_source'];
  fallback_reason?: string | null;
};

export const FindingsView: React.FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const { navigate } = useRouter();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [contentDetail, setContentDetail] = useState<any>(null);
  const [checkResult, setCheckResult] = useState<ContentCheckResult | null>(null);
  const [checkMetaById, setCheckMetaById] = useState<Record<string, CheckMeta>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [approving, setApproving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const canVerifyOrEdit = currentRole !== 'Agency';

  // Dismiss / Override modal state
  const [dismissFindingId, setDismissFindingId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState<string>('');
  const [dismissLoading, setDismissLoading] = useState<boolean>(false);

  // Selected fix options per finding
  const [selectedFixes, setSelectedFixes] = useState<Record<string, 'minimal' | 'professional' | 'marketing'>>({});
  const [, setAppliedFixes] = useState<Record<string, string>>({});

  useEffect(() => {
    loadItems();
  }, [currentRole]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId, checkMetaById[selectedId]);
    }
  }, [selectedId]);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      setForbidden(false);
      const data = await api.getContentItems();
      const safeData = data || [];
      setItems(safeData);
      if (safeData.length > 0) {
        if (!selectedId || !safeData.some(d => d.id === selectedId)) {
          setSelectedId(safeData[0].id);
        }
      } else {
        setSelectedId('');
        setContentDetail(null);
        setCheckResult(null);
      }
    } catch (err: any) {
      if (isPermissionError(err)) {
        setForbidden(true);
        setError(null);
      } else {
        setError(err.message || 'Failed to load content items');
      }
      setItems([]);
      setSelectedId('');
      setContentDetail(null);
      setCheckResult(null);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: string, preservedMeta?: CheckMeta) => {
    try {
      setLoading(true);
      setError(null);
      setForbidden(false);
      setCheckResult(null);
      const detail = await api.getContentDetail(id);
      setContentDetail(detail);

      const effectiveMeta = preservedMeta || checkMetaById[id];

      // Map existing findings if already verified
      if (detail.findings && detail.findings.length > 0) {
        const mappedFindings: Finding[] = detail.findings.map((f: any) => ({
          finding_id: f.id,
          claim_id: f.claim_id,
          risk_tier: f.risk_tier,
          status: f.status === 'open' ? (f.risk_tier === 'Critical' ? 'Contradicted' : (f.risk_tier === 'Info' ? 'Verified' : 'Unverified')) : f.status,
          reason: f.reason,
          source_reference: f.source_reference,
          extraction_confidence: f.extraction_confidence,
          excerpt: f.reason,
          span_start: 0,
          span_end: 0,
          raw_span_text: '',
          fix_options: f.fix_options,
          claim_type: 'text'
        }));
        setCheckResult({
          content_id: id,
          content_version_id: detail.latest_version?.version_id,
          content_status: mappedFindings.some(f => f.risk_tier === 'Critical' || f.risk_tier === 'High') ? 'Needs human review' : 'Ready for review',
          findings_count: mappedFindings.length,
          findings: mappedFindings,
          ai_label: effectiveMeta?.ai_label || 'AI-assisted analysis',
          ai_unavailable: effectiveMeta?.ai_unavailable,
          extraction_source: effectiveMeta?.extraction_source,
          fallback_reason: effectiveMeta?.fallback_reason,
        });
      }
    } catch (err: any) {
      if (isPermissionError(err)) {
        setForbidden(true);
        setError(null);
      } else {
        setError(err.message || 'Failed to load content details');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRunCheck = async () => {
    if (!selectedId || !canVerifyOrEdit) return;
    try {
      setChecking(true);
      setError(null);
      setSuccessMsg(null);
      const result = await api.checkContent(selectedId);
      const meta: CheckMeta = {
        ai_unavailable: result.ai_unavailable,
        ai_label: result.ai_label,
        extraction_source: result.extraction_source,
        fallback_reason: result.fallback_reason,
      };
      setCheckMetaById(prev => ({ ...prev, [selectedId]: meta }));
      setCheckResult(result);
      const msg = result.ai_unavailable
        ? `Verification complete (${result.findings_count} finding(s)) using deterministic/cached fallback.`
        : `Verification complete: ${result.findings_count} finding(s) extracted.`;
      setSuccessMsg(msg);
      showToast({
        type: result.ai_unavailable ? 'warning' : 'success',
        title: result.ai_unavailable ? 'AI Fallback Verification' : 'Verification Completed',
        message: msg,
      });
      await loadDetail(selectedId, meta);
    } catch (err: any) {
      const msg = err.message || 'Verification check failed';
      setError(msg);
      showToast({ type: 'error', title: 'Check Failed', message: msg });
    } finally {
      setChecking(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedId) return;
    try {
      setApproving(true);
      setError(null);
      setSuccessMsg(null);
      await api.approveContent(selectedId, 'Standard editorial approval passed after review');
      const msg = 'Content item approved successfully.';
      setSuccessMsg(msg);
      showToast({ type: 'success', title: 'Content Approved', message: msg });
      loadItems();
      loadDetail(selectedId);
    } catch (err: any) {
      const msg = err.message || 'Approval rejected';
      setError(msg);
      showToast({ type: 'error', title: 'Approval Blocked', message: msg });
    } finally {
      setApproving(false);
    }
  };

  const handleDismissFinding = async () => {
    if (!dismissFindingId || !dismissReason.trim()) return;
    try {
      setDismissLoading(true);
      setError(null);
      await api.dismissFinding(dismissFindingId, dismissReason, 'dismissed');
      const msg = 'Finding dismissed and logged to Precedents.';
      setSuccessMsg(msg);
      showToast({ type: 'info', title: 'Precedent Logged', message: msg });
      setDismissFindingId(null);
      setDismissReason('');
      handleRunCheck();
    } catch (err: any) {
      const msg = err.message || 'Failed to dismiss finding';
      setError(msg);
      showToast({ type: 'error', title: 'Dismiss Failed', message: msg });
    } finally {
      setDismissLoading(false);
    }
  };

  const applyFixOption = (findingId: string, fixText: string) => {
    setAppliedFixes(prev => ({ ...prev, [findingId]: fixText }));
    const msg = `Fix selected: "${fixText}". Ready for editor update.`;
    setSuccessMsg(msg);
    showToast({ type: 'info', title: 'Fix Selected', message: msg });
  };

  const selectedItem = items.find(i => i.id === selectedId);
  const rawText = contentDetail?.latest_version?.raw_text || '';
  const findingsList = checkResult?.findings || [];
  const hasCriticalOrHigh = findingsList.some(
    f => (f.risk_tier === 'Critical' || f.risk_tier === 'High') && (f.status as string) !== 'dismissed' && (f.status as string) !== 'overridden'
  );

  if (forbidden) {
    return (
      <RoleRestrictedCard
        currentRole={currentRole}
        featureTitle="Content Verification & Findings"
        allowedRolesLabel="Admin, Creator, Reviewer, Agency (Assigned Campaign)"
        onGoBack={() => navigate('/app/facts')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header / Action Bar */}
      <GlassCard className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center flex-wrap gap-2">
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Content Verification &amp; Findings
            </h1>
            {checkResult?.ai_unavailable ? (
              <span
                title={checkResult.fallback_reason || 'Groq API unavailable; deterministic/cached verification used.'}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800"
              >
                <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>AI unavailable, using deterministic/cached result</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                <SparklesIcon className="w-3.5 h-3.5" />
                <span>{checkResult?.ai_label || 'AI-assisted analysis'}</span>
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Deterministic claim extraction, factual ground-truth matching, and human decision gate.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          <select
            value={selectedId || (items.length > 0 ? items[0].id : '')}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={loading || items.length === 0}
            className="text-xs sm:text-sm border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium w-full sm:w-auto min-w-[240px] sm:min-w-[320px] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <option value="" disabled className="bg-white dark:bg-slate-900 text-slate-500">Loading content pieces...</option>
            ) : items.length === 0 ? (
              <option value="" disabled className="bg-white dark:bg-slate-900 text-slate-500">
                {currentRole === 'Agency' ? 'No content items available for campaign' : 'No content items loaded'}
              </option>
            ) : (
              items.map(it => (
                <option
                  key={it.id}
                  value={it.id}
                  className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-1"
                >
                  {it.title} ({it.channel}) — [{it.current_state}]
                </option>
              ))
            )}
          </select>

          {canVerifyOrEdit ? (
            <Button
              variant="primary"
              size="sm"
              onClick={handleRunCheck}
              disabled={checking || !selectedId || items.length === 0}
              isLoading={checking}
              leftIcon={<RefreshIcon className="w-4 h-4" />}
            >
              {checking ? 'Checking...' : 'Run Verification'}
            </Button>
          ) : (
            <span className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Agency: Read-Only View
            </span>
          )}

          {(currentRole === 'Reviewer' || currentRole === 'Admin') && selectedItem?.current_state !== 'archived' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleApprove}
              disabled={approving || hasCriticalOrHigh || selectedItem?.current_state === 'approved'}
              isLoading={approving}
              leftIcon={<CheckCircleIcon className="w-4 h-4 text-emerald-400" />}
              title={hasCriticalOrHigh ? 'Cannot approve: open Critical or High findings exist' : 'Approve content'}
            >
              {approving ? 'Approving...' : 'Approve Content'}
            </Button>
          )}
        </div>
      </GlassCard>

      {/* Notifications / Alerts */}
      {error && (
        <ErrorRetryCard
          title="Could not load content findings"
          message={error}
          onRetry={loadItems}
          retrying={loading}
        />
      )}

      {items.length === 0 && !loading && !error && (
        <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>
              {currentRole === 'Agency'
                ? 'No content items available for your assigned campaign.'
                : 'No content items available yet. Click Refresh to check again.'}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={loadItems} leftIcon={<RefreshIcon className="w-3.5 h-3.5" />}>
            Refresh
          </Button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center space-x-2 animate-in fade-in">
          <CheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Asset Text Preview */}
        <div className="lg:col-span-5 space-y-4">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Asset Text Preview
              </span>
              <StatusBadge status={selectedItem?.current_state || 'draft'} />
            </div>

            <div className="mt-4 p-4 rounded-xl bg-slate-100/60 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60 text-xs sm:text-sm leading-relaxed font-sans text-slate-800 dark:text-slate-200 whitespace-pre-wrap select-text">
              {loading ? (
                <div className="space-y-2 py-4">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-5/6" />
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse w-4/6" />
                </div>
              ) : (
                rawText || <span className="text-slate-400 italic">No text found.</span>
              )}
            </div>

            {checkResult && (
              <div className="mt-4 p-3 rounded-xl flex items-center justify-between bg-slate-100/80 dark:bg-slate-950/80 border border-slate-200/60 dark:border-slate-800/60 text-xs text-slate-600 dark:text-slate-300">
                <span>Overall Status:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded-full ${
                    checkResult.content_status === 'Ready for review'
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  }`}
                >
                  {checkResult.content_status}
                </span>
              </div>
            )}
          </GlassCard>
        </div>

        {/* Right Column: Findings Breakdown */}
        <div className="lg:col-span-7 space-y-4">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
              <div className="flex items-center space-x-2">
                <ShieldCheckIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Extracted Claims &amp; Findings ({findingsList.length})
                </h2>
              </div>
              <span className="text-xs text-slate-400">Deterministic Verification</span>
            </div>

            {loading ? (
              <div className="py-6 space-y-3">
                <CardSkeleton rows={2} />
                <CardSkeleton rows={2} />
              </div>
            ) : findingsList.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                <CheckCircleIcon className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <p className="font-bold text-slate-800 dark:text-slate-200">No open findings or issues.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Click &quot;Run Verification&quot; to parse claims with LLM and verify against brand facts.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {findingsList.map((f, idx) => {
                  const selectedFixType = selectedFixes[f.finding_id] || 'minimal';
                  const activeFixText = f.fix_options ? f.fix_options[selectedFixType] : null;

                  return (
                    <div
                      key={f.finding_id || idx}
                      className={`p-4 rounded-xl border transition-all ${
                        f.risk_tier === 'Critical'
                          ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20'
                          : f.risk_tier === 'High'
                          ? 'border-orange-200 dark:border-orange-900/60 bg-orange-50/50 dark:bg-orange-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-950/40'
                      }`}
                    >
                      {/* Finding Header */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center space-x-2">
                          <TierBadge tier={f.risk_tier} />
                          <StatusBadge status={f.status} />
                          {f.raw_span_text && (
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-white/80 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200">
                              &quot;{f.raw_span_text}&quot;
                            </span>
                          )}
                        </div>
                        <ConfidenceBar confidence={f.extraction_confidence} />
                      </div>

                      {/* Reason & Evidence Excerpt */}
                      <div className="mt-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                        <p className="font-medium">{f.reason}</p>
                        {f.source_reference && (
                          <div className="mt-2 text-xs flex items-center text-slate-500 dark:text-slate-400 bg-white/60 dark:bg-slate-900/60 px-2.5 py-1 rounded-lg border border-slate-200/80 dark:border-slate-800">
                            <FileTextIcon className="w-3.5 h-3.5 mr-1 text-slate-400" />
                            <span>Source Evidence: <strong className="text-slate-700 dark:text-slate-300">{f.source_reference}</strong></span>
                          </div>
                        )}
                      </div>

                      {/* Fix Options (Professional, Marketing, Minimal) */}
                      {f.fix_options && selectedItem?.current_state !== 'archived' && (
                        <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
                          <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 flex items-center justify-between">
                            <span>Re-verified Fix Recommendations:</span>
                            <div className="flex space-x-1">
                              {(['minimal', 'professional', 'marketing'] as const).map(mode => (
                                <button
                                  key={mode}
                                  onClick={() => setSelectedFixes(prev => ({ ...prev, [f.finding_id]: mode }))}
                                  className={`px-2 py-0.5 text-xs rounded-md capitalize transition ${
                                    selectedFixType === mode
                                      ? 'bg-purple-600 text-white font-medium shadow-xs'
                                      : 'bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                                  }`}
                                >
                                  {mode}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="p-3 bg-white/80 dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-800 dark:text-slate-200 flex items-center justify-between">
                            <span className="italic font-sans">&quot;{activeFixText}&quot;</span>
                            {canVerifyOrEdit && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => activeFixText && applyFixOption(f.finding_id, activeFixText)}
                                className="ml-3 shrink-0"
                              >
                                Apply fix
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Reviewer Override / Dismiss Action */}
                      {(currentRole === 'Reviewer' || currentRole === 'Admin') && selectedItem?.current_state !== 'archived' && (
                        <div className="mt-3 pt-2 flex justify-end">
                          <button
                            onClick={() => {
                              setDismissFindingId(f.finding_id);
                              setDismissReason('');
                            }}
                            className="text-xs text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 underline font-medium transition"
                          >
                            Dismiss / Log Precedent
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Dismiss / Living Guidelines Modal */}
      {dismissFindingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <GlassCard intensity="prominent" className="max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Reviewer Override &amp; Precedent
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Phase 5 Living Guidelines: All overrides require an auditable business rationale to be logged.
            </p>

            <textarea
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="Enter justification for overriding this finding (min 10 characters)..."
              rows={4}
              className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm bg-white/90 dark:bg-slate-950/90 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            />

            <div className="flex justify-end space-x-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDismissFindingId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleDismissFinding}
                disabled={dismissLoading || dismissReason.trim().length < 10}
                isLoading={dismissLoading}
              >
                Confirm Override
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};

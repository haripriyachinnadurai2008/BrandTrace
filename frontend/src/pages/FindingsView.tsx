import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { ContentItem, Finding, ContentCheckResult, UserRole } from '../types';
import { TierBadge, StatusBadge, ConfidenceBar } from '../components/Badges';
import {
  ShieldCheckIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  RefreshIcon,
  SparklesIcon,
  FileTextIcon,
  CheckIcon
} from '../components/Icons';

export const FindingsView: React.FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [contentDetail, setContentDetail] = useState<any>(null);
  const [checkResult, setCheckResult] = useState<ContentCheckResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [approving, setApproving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Dismiss / Override modal state
  const [dismissFindingId, setDismissFindingId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState<string>('');
  const [dismissLoading, setDismissLoading] = useState<boolean>(false);

  // Selected fix options per finding
  const [selectedFixes, setSelectedFixes] = useState<Record<string, 'minimal' | 'professional' | 'marketing'>>({});
  const [appliedFixes, setAppliedFixes] = useState<Record<string, string>>({});

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
    }
  }, [selectedId]);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getContentItems();
      setItems(data);
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load content items');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      setCheckResult(null);
      const detail = await api.getContentDetail(id);
      setContentDetail(detail);

      // Map existing findings if already verified
      if (detail.findings && detail.findings.length > 0) {
        const mappedFindings: Finding[] = detail.findings.map((f: any) => ({
          finding_id: f.id,
          claim_id: f.claim_id,
          risk_tier: f.risk_tier,
          status: f.status === 'open' ? (f.risk_tier === 'Critical' ? 'Contradicted' : 'Unverified') : f.status,
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
          ai_label: 'AI-assisted analysis'
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load content details');
    } finally {
      setLoading(false);
    }
  };

  const handleRunCheck = async () => {
    if (!selectedId) return;
    try {
      setChecking(true);
      setError(null);
      setSuccessMsg(null);
      const result = await api.checkContent(selectedId);
      setCheckResult(result);
      setSuccessMsg(`Check completed: ${result.findings_count} finding(s) extracted.`);
      loadDetail(selectedId);
    } catch (err: any) {
      setError(err.message || 'Verification check failed');
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
      setSuccessMsg('Content item approved successfully.');
      loadItems();
      loadDetail(selectedId);
    } catch (err: any) {
      setError(err.message || 'Approval rejected');
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
      setSuccessMsg('Finding dismissed and logged to Precedents.');
      setDismissFindingId(null);
      setDismissReason('');
      handleRunCheck();
    } catch (err: any) {
      setError(err.message || 'Failed to dismiss finding');
    } finally {
      setDismissLoading(false);
    }
  };

  const applyFixOption = (findingId: string, fixText: string) => {
    setAppliedFixes(prev => ({ ...prev, [findingId]: fixText }));
    setSuccessMsg(`Fix selected: "${fixText}". Ready for editor update.`);
  };

  const selectedItem = items.find(i => i.id === selectedId);
  const rawText = contentDetail?.latest_version?.raw_text || '';
  const findingsList = checkResult?.findings || [];
  const hasCriticalOrHigh = findingsList.some(
    f => (f.risk_tier === 'Critical' || f.risk_tier === 'High') && (f.status as string) !== 'dismissed' && (f.status as string) !== 'overridden'
  );

  return (
    <div className="space-y-6">
      {/* Top Header / Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-slate-900">Content Verification & Findings</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
              <SparklesIcon className="w-3.5 h-3.5 mr-1" />
              AI-assisted analysis
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Deterministic claim extraction, factual ground-truth matching, and human decision gate.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
          >
            {items.map(it => (
              <option key={it.id} value={it.id}>
                {it.title} ({it.channel}) — [{it.current_state}]
              </option>
            ))}
          </select>

          <button
            onClick={handleRunCheck}
            disabled={checking || !selectedId}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition shadow-sm"
          >
            <RefreshIcon className={`w-4 h-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking...' : 'Run Verification'}
          </button>

          {(currentRole === 'Reviewer' || currentRole === 'Admin') && (
            <button
              onClick={handleApprove}
              disabled={approving || hasCriticalOrHigh || selectedItem?.current_state === 'approved'}
              title={hasCriticalOrHigh ? 'Cannot approve: open Critical or High findings exist' : 'Approve content'}
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 transition shadow-sm"
            >
              <CheckCircleIcon className="w-4 h-4 mr-1.5" />
              {approving ? 'Approving...' : 'Approve Content'}
            </button>
          )}
        </div>
      </div>

      {/* Notifications / Alerts */}
      {error && (
        <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start space-x-2">
          <AlertCircleIcon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Action Blocked: </span>
            {error}
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center space-x-2">
          <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Content Preview & Verification Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Asset Copy & Highlighted Spans */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Asset Text Preview
              </span>
              <StatusBadge status={selectedItem?.current_state || 'draft'} />
            </div>

            <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm leading-relaxed font-sans text-slate-800 whitespace-pre-wrap select-text">
              {rawText || <span className="text-slate-400 italic">No text found.</span>}
            </div>

            {checkResult && (
              <div className="mt-4 p-3 rounded-lg flex items-center justify-between bg-slate-100 text-xs text-slate-600">
                <span>Overall Status:</span>
                <span
                  className={`font-semibold px-2 py-0.5 rounded ${
                    checkResult.content_status === 'Ready for review'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {checkResult.content_status}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Findings Breakdown */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <ShieldCheckIcon className="w-5 h-5 text-purple-600" />
                <h2 className="text-base font-bold text-slate-900">
                  Extracted Claims & Findings ({findingsList.length})
                </h2>
              </div>
              <span className="text-xs text-slate-400">Deterministic Backend Verification</span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400">Loading findings...</div>
            ) : findingsList.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <CheckCircleIcon className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="font-medium text-slate-700">No open findings or issues.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Click "Run Verification" to parse claims with LLM and verify against brand facts.
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
                          ? 'border-red-300 bg-red-50/40'
                          : f.risk_tier === 'High'
                          ? 'border-orange-200 bg-orange-50/30'
                          : 'border-slate-200 bg-slate-50/50'
                      }`}
                    >
                      {/* Finding Header */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center space-x-2">
                          <TierBadge tier={f.risk_tier} />
                          <StatusBadge status={f.status} />
                          {f.raw_span_text && (
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-white rounded border border-slate-200 text-slate-800">
                              "{f.raw_span_text}"
                            </span>
                          )}
                        </div>
                        <ConfidenceBar confidence={f.extraction_confidence} />
                      </div>

                      {/* Reason & Evidence Excerpt */}
                      <div className="mt-3 text-sm text-slate-700">
                        <p className="font-medium">{f.reason}</p>
                        {f.source_reference && (
                          <div className="mt-2 text-xs flex items-center text-slate-500 bg-white/70 px-2.5 py-1 rounded border border-slate-200/80">
                            <FileTextIcon className="w-3.5 h-3.5 mr-1 text-slate-400" />
                            <span>Source Evidence: <strong className="text-slate-700">{f.source_reference}</strong></span>
                          </div>
                        )}
                      </div>

                      {/* Fix Options (Professional, Marketing, Minimal) */}
                      {f.fix_options && (
                        <div className="mt-3 pt-3 border-t border-slate-200/60">
                          <div className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center justify-between">
                            <span>Re-verified Fix Recommendations:</span>
                            <div className="flex space-x-1">
                              {(['minimal', 'professional', 'marketing'] as const).map(mode => (
                                <button
                                  key={mode}
                                  onClick={() => setSelectedFixes(prev => ({ ...prev, [f.finding_id]: mode }))}
                                  className={`px-2 py-0.5 text-xs rounded capitalize transition ${
                                    selectedFixType === mode
                                      ? 'bg-purple-600 text-white font-medium'
                                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {mode}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs text-slate-800 flex items-center justify-between">
                            <span className="italic font-sans">"{activeFixText}"</span>
                            <button
                              onClick={() => activeFixText && applyFixOption(f.finding_id, activeFixText)}
                              className="ml-3 shrink-0 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded transition"
                            >
                              Apply fix
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Reviewer Override / Dismiss Action (Phase 5) */}
                      {(currentRole === 'Reviewer' || currentRole === 'Admin') && (
                        <div className="mt-3 pt-2 flex justify-end">
                          <button
                            onClick={() => {
                              setDismissFindingId(f.finding_id);
                              setDismissReason('');
                            }}
                            className="text-xs text-slate-500 hover:text-slate-800 underline"
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
          </div>
        </div>
      </div>

      {/* Dismiss / Living Guidelines Modal */}
      {dismissFindingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900">Reviewer Override & Precedent</h3>
            <p className="text-xs text-slate-500 mt-1">
              Phase 5 Living Guidelines: All overrides require an auditable business rationale to be logged.
            </p>

            <textarea
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="Enter justification for overriding this finding (min 10 characters)..."
              rows={4}
              className="mt-3 w-full p-3 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />

            <div className="mt-4 flex justify-end space-x-2">
              <button
                onClick={() => setDismissFindingId(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDismissFinding}
                disabled={dismissLoading || dismissReason.trim().length < 10}
                className="px-4 py-2 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-40 rounded-lg transition"
              >
                {dismissLoading ? 'Logging...' : 'Confirm Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

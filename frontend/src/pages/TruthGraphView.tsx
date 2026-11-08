import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { BrandFact, UserRole, FactImpactResponse } from '../types';
import { GlassCard } from '../components/common/GlassCard';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import { showToast } from '../components/common/Toast';
import {
  GitCommitIcon,
  SparklesIcon,
  CheckCircleIcon,
  CheckIcon,
  FileTextIcon,
  ArrowRightIcon,
  LockIcon,
  AlertCircleIcon,
} from '../components/Icons';

export const TruthGraphView: React.FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const [facts, setFacts] = useState<BrandFact[]>([]);
  const [selectedFact, setSelectedFact] = useState<BrandFact | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New version form state
  const [newValue, setNewValue] = useState<string>('₹5,499');
  const [validFrom, setValidFrom] = useState<string>('2026-12-01');
  const [sourceId, setSourceId] = useState<string>('src_price_list_dec');
  const [sourcePage, setSourcePage] = useState<number>(3);
  const [changeReason, setChangeReason] = useState<string>('Annual price revision for Festive Q4');
  const [evidenceSources, setEvidenceSources] = useState<any[]>([]);

  // Preview Modal state
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<FactImpactResponse | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const isAdmin = currentRole === 'Admin';

  useEffect(() => {
    loadFacts();
  }, [currentRole]);

  const loadFacts = async () => {
    try {
      setLoading(true);
      setError(null);
      const [factsData, sourcesData] = await Promise.all([
        api.getFacts(),
        api.getEvidenceSources().catch(() => [])
      ]);

      const safeFacts = factsData || [];
      setFacts(safeFacts);
      setEvidenceSources(sourcesData || []);

      if (sourcesData && sourcesData.length > 0) {
        const decSrc = sourcesData.find((s: any) => s.id === 'src_price_list_dec');
        if (decSrc) {
          setSourceId('src_price_list_dec');
          setSourcePage(3);
        } else {
          setSourceId(sourcesData[0].id);
        }
      }

      if (safeFacts.length > 0) {
        // Preselect F001 if available (or if it is the only fact), otherwise first fact
        const f001 = safeFacts.find(f => f.id === 'F001');
        const defaultFact = f001 || safeFacts[0];
        setSelectedFact(defaultFact);

        // Compute current active version value
        const versions = defaultFact.versions ? [...defaultFact.versions].sort((a, b) => b.version_no - a.version_no) : [];
        const currentActive = versions[0];
        if (currentActive) {
          if (defaultFact.id === 'F001' && currentActive.value === '₹4,999') {
            setNewValue('₹5,499');
          } else {
            setNewValue(currentActive.value);
          }
        }
      } else {
        setSelectedFact(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load brand facts');
      setFacts([]);
      setSelectedFact(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFactChange = (factId: string) => {
    const f = facts.find(fact => fact.id === factId);
    if (f) {
      setSelectedFact(f);
      const versions = f.versions ? [...f.versions].sort((a, b) => b.version_no - a.version_no) : [];
      const currentActive = versions[0];
      if (currentActive) {
        if (f.id === 'F001' && currentActive.value === '₹4,999') {
          setNewValue('₹5,499');
        } else {
          setNewValue(currentActive.value);
        }
      }
    }
  };

  // Compute active fact version
  const sortedVersions = selectedFact?.versions
    ? [...selectedFact.versions].sort((a, b) => b.version_no - a.version_no)
    : [];
  const currentActiveVersion = sortedVersions[0];

  // Validation: value must differ from active value, fields cannot be blank
  const isUnchangedValue = Boolean(
    currentActiveVersion &&
    newValue.trim().toLowerCase() === currentActiveVersion.value.trim().toLowerCase()
  );

  const isFormValid = Boolean(
    isAdmin &&
    selectedFact &&
    newValue.trim().length > 0 &&
    validFrom.trim().length > 0 &&
    changeReason.trim().length > 0 &&
    !isUnchangedValue
  );

  const handlePreviewImpact = async () => {
    if (!isAdmin || !selectedFact || !isFormValid) return;
    try {
      setPreviewLoading(true);
      setError(null);
      const data = await api.getFactImpact(selectedFact.id, newValue.trim(), `${validFrom}T00:00:00+05:30`);
      setPreviewData(data);
      setPreviewOpen(true);
    } catch (err: any) {
      setError(err.message || 'Failed to preview impact');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmAtomicCommit = async () => {
    if (!isAdmin || !selectedFact || !isFormValid) return;
    try {
      setSubmitting(true);
      setError(null);
      await api.createFactVersion(selectedFact.id, {
        value: newValue.trim(),
        unit: 'INR',
        valid_from: `${validFrom}T00:00:00+05:30`,
        source_id: sourceId,
        source_page: sourcePage,
        reason: changeReason.trim(),
      });
      const msg = `Fact version successfully updated. Downstream approvals invalidated and notifications dispatched.`;
      setSuccessMsg(msg);
      showToast({ type: 'success', title: 'Fact Version Committed', message: msg });
      setPreviewOpen(false);
      loadFacts();
    } catch (err: any) {
      const msg = err.message || 'Transaction failed and was rolled back';
      setError(msg);
      showToast({ type: 'error', title: 'Commit Failed', message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <GlassCard className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <GitCommitIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Brand Truth Graph &amp; Fact Versioning
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            &quot;Git for brand facts&quot;: Single-source-of-truth timeline with atomic transactional cascades and rollback guarantee.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            isAdmin
              ? 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
          }`}>
            {isAdmin ? 'Admin: Full Versioning Access' : `${currentRole}: Read-Only Truth Graph`}
          </span>
        </div>
      </GlassCard>

      {/* Error state with Retry button */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center space-x-2">
            <AlertCircleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadFacts}
            className="shrink-0"
          >
            Retry
          </Button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center space-x-2 animate-in fade-in">
          <CheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Fact Version Timeline */}
        <div className="lg:col-span-7 space-y-4">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {selectedFact ? `Fact Timeline History: ${selectedFact.name} (${selectedFact.id})` : 'Fact Timeline History'}
              </span>
              <span className="text-xs font-mono text-slate-400">Asia/Kolkata (IST)</span>
            </div>

            {loading ? (
              <div className="py-8 space-y-3">
                <Skeleton className="h-12 w-full" count={3} />
              </div>
            ) : facts.length === 0 ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400">
                <CheckCircleIcon className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  No facts available for your role or campaign
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {currentRole === 'Agency'
                    ? 'Your agency account has no assigned facts in this campaign.'
                    : 'No brand facts registered in the Truth Graph.'}
                </p>
              </div>
            ) : !selectedFact?.versions || selectedFact.versions.length === 0 ? (
              <div className="py-8 text-center text-slate-400 italic">No versions recorded for this fact.</div>
            ) : (
              <div className="mt-4 relative pl-6 border-l-2 border-purple-200 dark:border-purple-800 space-y-6">
                {sortedVersions.map((ver, idx) => (
                  <div key={ver.version_id || idx} className="relative">
                    <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-purple-600 border-2 border-white dark:border-slate-900 shadow-xs" />
                    <div className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/40">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-purple-600 dark:text-purple-400">
                          Version {ver.version_no} · ID: {ver.version_id}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {ver.created_at ? new Date(ver.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}
                        </span>
                      </div>

                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                          {ver.value}
                        </span>
                        <span className="text-xs text-slate-500">{ver.unit}</span>
                      </div>

                      <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                        <div>Valid from: <strong className="font-mono">{ver.valid_from ? new Date(ver.valid_from).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Immediate'}</strong></div>
                        {(ver as any).reason && <div className="mt-1 text-slate-500 italic">&quot;{(ver as any).reason}&quot;</div>}
                      </div>

                      {((ver as any).source_file_name || ver.source_id) && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex items-center gap-1.5">
                          <FileTextIcon className="w-3.5 h-3.5 text-purple-500" />
                          <span>Source: <strong>{(ver as any).source_file_name || ver.source_id}</strong> (Page {ver.source_page})</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Right: Mutate Fact Version / Fact Selection Panel */}
        <div className="lg:col-span-5 space-y-4">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Mutate Fact (Transactional)
              </span>
              <span className="text-xs font-mono text-purple-600 dark:text-purple-400 font-bold">
                {isAdmin ? 'Atomic Commit' : 'Read-Only Mode'}
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {/* Select Target Fact Dropdown (Visible & Enabled for ALL roles having facts) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Select Target Fact
                </label>
                {facts.length === 0 ? (
                  <select
                    disabled
                    className="w-full text-xs sm:text-sm border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-100 dark:bg-slate-900 text-slate-400 cursor-not-allowed"
                  >
                    <option value="" className="bg-white dark:bg-slate-900 text-slate-500">No facts available for your role or campaign</option>
                  </select>
                ) : (
                  <select
                    value={selectedFact?.id || (facts.length > 0 ? facts[0].id : '')}
                    onChange={(e) => handleFactChange(e.target.value)}
                    className="w-full text-xs sm:text-sm border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                  >
                    {facts.map(f => {
                      const latestVal = f.versions && f.versions.length > 0 ? f.versions[0].value : 'N/A';
                      return (
                        <option
                          key={f.id}
                          value={f.id}
                          className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-1"
                        >
                          {f.id} - {f.name} (Current: {latestVal})
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>

              {/* Proposed Value Field */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  New Proposed Value
                </label>
                <input
                  type="text"
                  disabled={!isAdmin || facts.length === 0}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 font-mono bg-white/80 dark:bg-slate-950/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                />
                {isAdmin && isUnchangedValue && (
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    ⚠️ Proposed value is identical to current active value ({currentActiveVersion?.value}).
                  </div>
                )}
              </div>

              {/* Effective From Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Effective From Date (IST)
                </label>
                <input
                  type="date"
                  disabled={!isAdmin || facts.length === 0}
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full text-xs sm:text-sm border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 bg-white/80 dark:bg-slate-950/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                />
              </div>

              {/* Supporting Document & Page */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Supporting Document &amp; Page
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    disabled={!isAdmin || facts.length === 0}
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    className="col-span-2 text-xs border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 bg-white/80 dark:bg-slate-950/80 text-slate-900 dark:text-white disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                  >
                    {evidenceSources.length > 0 ? (
                      evidenceSources.map(s => (
                        <option key={s.id} value={s.id}>{s.name || s.id}</option>
                      ))
                    ) : (
                      <option value="src_price_list_dec">pricing_memo_q4.pdf</option>
                    )}
                  </select>
                  <input
                    type="number"
                    min={1}
                    disabled={!isAdmin || facts.length === 0}
                    value={sourcePage}
                    onChange={(e) => setSourcePage(parseInt(e.target.value) || 1)}
                    placeholder="Page #"
                    className="text-xs border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-2 font-mono bg-white/80 dark:bg-slate-950/80 text-slate-900 dark:text-white disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Change Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Change Reason / Audit Justification
                </label>
                <textarea
                  rows={2}
                  disabled={!isAdmin || facts.length === 0}
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Mandatory reason for audit trail..."
                  className="w-full text-xs border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 bg-white/80 dark:bg-slate-950/80 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:bg-slate-100 dark:disabled:bg-slate-900 disabled:cursor-not-allowed"
                />
              </div>

              {/* Non-Admin Notice */}
              {!isAdmin && (
                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200 flex items-center gap-2">
                  <LockIcon className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400" />
                  <span>Read-only: only Admin can publish new fact versions.</span>
                </div>
              )}

              {/* Preview Button */}
              <Button
                variant="primary"
                size="md"
                onClick={handlePreviewImpact}
                disabled={!isAdmin || !isFormValid || previewLoading || facts.length === 0}
                isLoading={previewLoading}
                rightIcon={<ArrowRightIcon className="w-4 h-4" />}
                className="w-full mt-2 disabled:cursor-not-allowed"
                title={!isAdmin ? 'Read-only: only Admin can publish new fact versions' : !isFormValid ? 'Fill all fields with a changed value to preview' : 'Preview impact'}
              >
                Preview Blast Radius Impact
              </Button>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Impact Preview Modal (Admin Only) */}
      {previewOpen && previewData && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <GlassCard intensity="prominent" className="max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-slate-800/80">
              <div className="flex items-center space-x-2">
                <SparklesIcon className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Atomic Commit Preview: {selectedFact?.id}
                </h3>
              </div>
              <span className="text-xs font-mono text-purple-600 dark:text-purple-400 font-bold">Pre-Flight Simulation</span>
            </div>

            <div className="p-3.5 bg-purple-500/10 rounded-xl border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200 leading-relaxed">
              ⚠️ <strong>Atomic Invalidation Notice:</strong> Committing this version will invalidate approvals across <strong>{previewData.summary.re_review}</strong> asset(s) and flag <strong>{previewData.summary.red_alert}</strong> live RED ALERT(s). All mutations occur in a single database transaction.
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                <div className="font-bold text-base">{previewData.summary.re_review}</div>
                <div>Re-review</div>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-300 dark:border-purple-800 text-purple-900 dark:text-purple-200">
                <div className="font-bold text-base">{previewData.summary.stale}</div>
                <div>Stale</div>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200">
                <div className="font-bold text-base">{previewData.summary.red_alert}</div>
                <div>RED ALERT</div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200">
                <div className="font-bold text-base">{previewData.summary.left_alone}</div>
                <div>Left Alone</div>
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreviewOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmAtomicCommit}
                disabled={submitting}
                isLoading={submitting}
                rightIcon={<CheckCircleIcon className="w-4 h-4" />}
              >
                Confirm &amp; Broadcast Transaction
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};

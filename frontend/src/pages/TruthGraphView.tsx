import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { BrandFact, FactVersion, UserRole, FactImpactResponse } from '../types';
import { GitCommitIcon, HistoryIcon, SparklesIcon, CheckCircleIcon, AlertTriangleIcon, CheckIcon } from '../components/Icons';

export const TruthGraphView: React.FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const [facts, setFacts] = useState<BrandFact[]>([]);
  const [selectedFact, setSelectedFact] = useState<BrandFact | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // New version form state
  const [newValue, setNewValue] = useState<string>('₹5,499');
  const [validFrom, setValidFrom] = useState<string>('2026-12-01');
  const [sourceId, setSourceId] = useState<string>('src_price_list_sep');
  const [sourcePage, setSourcePage] = useState<number>(3);
  const [changeReason, setChangeReason] = useState<string>('Annual price revision for Festive Q4');

  // Preview Modal state
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<FactImpactResponse | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadFacts();
  }, []);

  const loadFacts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getFacts();
      setFacts(data);
      if (data.length > 0 && !selectedFact) {
        setSelectedFact(data[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load brand facts');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewImpact = async () => {
    if (!selectedFact) return;
    try {
      setPreviewLoading(true);
      setError(null);
      const data = await api.getFactImpact(selectedFact.id, newValue, `${validFrom}T00:00:00+05:30`);
      setPreviewData(data);
      setPreviewOpen(true);
    } catch (err: any) {
      setError(err.message || 'Failed to preview impact');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmAtomicCommit = async () => {
    if (!selectedFact) return;
    try {
      setSubmitting(true);
      setError(null);
      await api.createFactVersion(selectedFact.id, {
        value: newValue,
        unit: 'INR',
        valid_from: `${validFrom}T00:00:00+05:30`,
        source_id: sourceId,
        source_page: sourcePage,
        reason: changeReason,
      });
      setSuccessMsg(`Fact version successfully updated. Downstream approvals invalidated and notifications dispatched.`);
      setPreviewOpen(false);
      loadFacts();
    } catch (err: any) {
      setError(err.message || 'Transaction failed and was rolled back');
    } finally {
      setSubmitting(false);
    }
  };

  const isAdmin = currentRole === 'Admin';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <GitCommitIcon className="w-5 h-5 text-purple-600" />
            <h1 className="text-xl font-bold text-slate-900">Brand Truth Graph & Fact Versioning</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            "Git for brand facts": Single-source-of-truth timeline with atomic transactional cascades and rollback guarantee.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-600'}`}>
            {isAdmin ? 'Admin: Full Versioning Access' : `${currentRole}: Read-Only Truth Graph`}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center space-x-2">
          <CheckIcon className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Fact Version Timeline */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Fact Timeline History: {selectedFact?.name} ({selectedFact?.id})
              </span>
              <span className="text-xs font-mono text-slate-400">Asia/Kolkata (IST)</span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-400">Loading version history...</div>
            ) : !selectedFact?.versions || selectedFact.versions.length === 0 ? (
              <div className="py-8 text-center text-slate-400 italic">No versions recorded.</div>
            ) : (
              <div className="mt-4 relative pl-6 border-l-2 border-purple-200 space-y-6">
                {selectedFact.versions.map((ver, idx) => {
                  const isCurrent = ver.status === 'approved' && !ver.valid_to;
                  return (
                    <div key={ver.version_id || idx} className="relative group">
                      <div
                        className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 bg-white ${
                          isCurrent ? 'border-purple-600 ring-4 ring-purple-100' : 'border-slate-300'
                        }`}
                      />
                      <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-purple-300 transition shadow-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-sm font-bold text-slate-900">
                              v{ver.version_no}
                            </span>
                            <span className="text-lg font-bold text-purple-700 font-mono">
                              {ver.value}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-xs uppercase tracking-wider font-semibold ${
                                isCurrent
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {ver.status}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 font-mono">
                            Page {ver.source_page}
                          </span>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                          <div>
                            <span className="text-slate-400">Effective From:</span>{' '}
                            <span className="font-mono font-medium text-slate-800">
                              {new Date(ver.valid_from).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400">Valid To:</span>{' '}
                            <span className="font-mono font-medium text-slate-800">
                              {ver.valid_to
                                ? new Date(ver.valid_to).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
                                : 'Active (Indefinite)'}
                            </span>
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
                          <span>Source ID: <strong className="font-mono text-slate-700">{ver.source_id}</strong></span>
                          <span>Norm: <strong className="font-mono text-purple-900">{ver.normalised_value}</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: New Version Mutation Form (Admin Only) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Propose Fact Revision
              </span>
              <span className="text-xs text-purple-600 font-medium">Atomic Commit</span>
            </div>

            {!isAdmin ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                <p className="font-medium text-slate-700">Mutation Guard Active</p>
                <p className="text-xs text-slate-400 mt-1">
                  Only the <strong>Admin</strong> role can record new fact versions and trigger downstream impact cascades.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Fact Value
                  </label>
                  <input
                    type="text"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="e.g. ₹5,499"
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 font-mono text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Effective From (Asia/Kolkata Midnight IST)
                  </label>
                  <input
                    type="date"
                    value={validFrom}
                    onChange={(e) => setValidFrom(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 text-sm focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="text-xs text-slate-400 mt-0.5 block">
                    Interpreted strictly as 00:00:00 IST (UTC-5:30 boundary)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Evidence Source ID
                    </label>
                    <input
                      type="text"
                      value={sourceId}
                      onChange={(e) => setSourceId(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 text-sm font-mono focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Page Number
                    </label>
                    <input
                      type="number"
                      value={sourcePage}
                      onChange={(e) => setSourcePage(parseInt(e.target.value) || 1)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 text-sm focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Change Rationale
                  </label>
                  <textarea
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    rows={2}
                    className="w-full p-2.5 border border-slate-300 rounded-lg text-slate-900 text-sm focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <button
                  onClick={handlePreviewImpact}
                  disabled={previewLoading || !newValue.trim()}
                  className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm rounded-lg transition shadow-sm flex items-center justify-center space-x-2"
                >
                  <SparklesIcon className="w-4 h-4" />
                  <span>{previewLoading ? 'Evaluating Graph...' : 'Preview What This Change Will Do'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal before Confirming */}
      {previewOpen && previewData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Pre-Commit Impact Verification: {selectedFact?.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Reviewing atomic downstream cascade before writing to database.
                </p>
              </div>
              <span className="text-sm font-bold font-mono text-purple-700">
                v{previewData.new_version_no} ({previewData.new_value})
              </span>
            </div>

            {/* Impact Summary Counters */}
            <div className="grid grid-cols-4 gap-2 my-4 text-center">
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                <div className="text-lg font-bold text-amber-800">{previewData.summary.re_review}</div>
                <div className="text-xs text-amber-600 font-medium">Re-review Req</div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200">
                <div className="text-lg font-bold text-slate-800">{previewData.summary.stale}</div>
                <div className="text-xs text-slate-600 font-medium">Drafts Stale</div>
              </div>
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200">
                <div className="text-lg font-bold text-red-800">{previewData.summary.red_alert}</div>
                <div className="text-xs text-red-600 font-medium">RED ALERTS</div>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="text-lg font-bold text-emerald-800">{previewData.summary.left_alone}</div>
                <div className="text-xs text-emerald-600 font-medium">Left Alone</div>
              </div>
            </div>

            {/* List of Affected Assets */}
            <div className="space-y-2 mt-3 max-h-60 overflow-y-auto pr-1">
              {previewData.items.map((item, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border border-slate-200 text-xs flex items-center justify-between bg-slate-50">
                  <div>
                    <span className="font-semibold text-slate-900">{item.title}</span>
                    <span className="ml-2 text-slate-500 capitalize">({item.channel})</span>
                  </div>
                  <span className={`font-semibold px-2 py-0.5 rounded ${
                    item.is_red_alert ? 'bg-red-600 text-white' : item.is_re_review ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {item.action_required}
                  </span>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end space-x-3">
              <button
                onClick={() => setPreviewOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAtomicCommit}
                disabled={submitting}
                className="px-5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg transition shadow-sm flex items-center space-x-1.5"
              >
                <GitCommitIcon className="w-4 h-4" />
                <span>{submitting ? 'Committing Transaction...' : 'Commit Version & Cascade Impact'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


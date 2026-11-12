import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, isPermissionError } from '../api/client';
import { EvidenceLocateResponse, Finding, UserRole } from '../types';
import { TierBadge, StatusBadge, ConfidenceBar } from './Badges';
import { GlassCard } from './common/GlassCard';
import { Button } from './common/Button';
import { RoleRestrictedCard } from './common/RoleRestrictedCard';
import {
  AlertTriangleIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileTextIcon,
  RefreshIcon,
  XIcon,
} from './Icons';

interface EvidenceViewerPanelProps {
  finding: Finding;
  documentId: string;
  initialPage: number;
  currentRole: UserRole;
  onClose: () => void;
}

export const EvidenceViewerPanel: React.FC<EvidenceViewerPanelProps> = ({
  finding,
  documentId,
  initialPage,
  currentRole,
  onClose,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(Math.max(1, initialPage || 1));
  const [pageCount, setPageCount] = useState<number>(Math.max(1, initialPage || 1));
  const [locateData, setLocateData] = useState<EvidenceLocateResponse | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLocated, setImageLocated] = useState<boolean | null>(null);
  const [imageReason, setImageReason] = useState<string>('');
  const [highlightsOnPage, setHighlightsOnPage] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState<boolean>(false);

  const activeBlobUrlRef = useRef<string | null>(null);

  const revokeBlob = () => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      revokeBlob();
    };
  }, [onClose]);

  const loadLocateAndPage = useCallback(
    async (targetPage: number, refreshLocate: boolean) => {
      try {
        setLoading(true);
        setError(null);
        setForbidden(false);

        let effectivePage = Math.max(1, targetPage);
        let loc: EvidenceLocateResponse | null = locateData;

        if (refreshLocate || !loc) {
          loc = await api.locateEvidence(documentId, finding.claim_id, finding.finding_id);
          setLocateData(loc);
          if (loc.page_count && loc.page_count > 0) {
            setPageCount(loc.page_count);
          }
          if (refreshLocate && loc.located && loc.evidence_page) {
            effectivePage = loc.evidence_page;
            setCurrentPage(loc.evidence_page);
          } else if (loc.page_count && effectivePage > loc.page_count) {
            effectivePage = loc.page_count;
            setCurrentPage(effectivePage);
          }
        }

        // Only fetch rendered PNG when document actually has >= 1 page
        if (loc && loc.page_count === 0) {
          revokeBlob();
          setImageUrl(null);
          setImageLocated(false);
          setImageReason(loc.reason || 'PDF file not available.');
          return;
        }

        const pageRes = await api.fetchEvidencePageImage(
          documentId,
          effectivePage,
          finding.claim_id
        );
        revokeBlob();
        activeBlobUrlRef.current = pageRes.objectUrl;
        setImageUrl(pageRes.objectUrl);
        setImageLocated(pageRes.located);
        setImageReason(pageRes.reason);
        setHighlightsOnPage(pageRes.highlights);
        if (pageRes.pageCount > 0) {
          setPageCount(pageRes.pageCount);
        }
      } catch (err: any) {
        revokeBlob();
        setImageUrl(null);
        if (isPermissionError(err)) {
          setForbidden(true);
          setError(null);
        } else {
          setError(err.message || 'Failed to load evidence PDF page.');
        }
      } finally {
        setLoading(false);
      }
    },
    [documentId, finding.claim_id, finding.finding_id, locateData]
  );

  // Initial load for the clicked finding
  useEffect(() => {
    setLocateData(null);
    setCurrentPage(Math.max(1, initialPage || 1));
    loadLocateAndPage(Math.max(1, initialPage || 1), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, finding.claim_id, finding.finding_id, initialPage]);

  const handlePageChange = (nextPage: number) => {
    const bounded = Math.max(1, Math.min(pageCount || 1, nextPage));
    if (bounded === currentPage && imageUrl) return;
    setCurrentPage(bounded);
    loadLocateAndPage(bounded, false);
  };

  const claimSummary = locateData?.claim;
  const displayClaimText =
    claimSummary?.raw_span_text ||
    finding.raw_span_text ||
    finding.claim_subject ||
    finding.excerpt ||
    'Extracted marketing claim';
  const displayExtractedValue =
    claimSummary?.raw_span_text || finding.raw_span_text || finding.normalised_value || '—';
  const displayVerifiedValue =
    claimSummary?.verified_value || finding.verified_value || 'No matched official fact';
  const displayConfidence =
    claimSummary?.extraction_confidence ?? finding.extraction_confidence ?? 0;

  const isLocated = locateData ? locateData.located : imageLocated === true;
  const notLocatedReason =
    (locateData && !locateData.located && locateData.reason) ||
    (!isLocated && imageReason) ||
    'The referenced value could not be matched inside this PDF.';
  const highlightedPage = locateData?.evidence_page ?? finding.evidence_page ?? initialPage;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="evidence-viewer-title"
      onClick={onClose}
    >
      <GlassCard
        intensity="prominent"
        className="w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden border border-purple-500/30 shadow-2xl"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Top Modal Bar */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-white/70 dark:bg-slate-950/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-purple-600/15 border border-purple-500/30 text-purple-600 dark:text-purple-300 shrink-0">
              <FileTextIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="evidence-viewer-title"
                className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate"
              >
                Source Evidence Viewer: {locateData?.title || documentId}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                {locateData?.file_name || documentId} · Cited reference: {finding.source_reference}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-block text-[11px] text-slate-400 font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              Esc to close
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close evidence viewer"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        {forbidden ? (
          <div className="p-6 overflow-y-auto">
            <RoleRestrictedCard
              currentRole={currentRole}
              featureTitle="Source Evidence PDF Viewer"
              allowedRolesLabel="Admin, Creator, Reviewer"
              onGoBack={onClose}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/80 dark:divide-slate-800">
            {/* LEFT PANEL: Claim, Extracted Value, Verified Value, Confidence */}
            <div className="lg:col-span-5 p-4 sm:p-6 space-y-4 bg-white/40 dark:bg-slate-950/30">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <TierBadge tier={finding.risk_tier} />
                  <StatusBadge status={finding.status} />
                </div>
                {locateData && (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                      isLocated
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/40'
                        : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-400/40'
                    }`}
                  >
                    {isLocated ? (
                      <>
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        <span>Located p.{highlightedPage}</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangleIcon className="w-3.5 h-3.5" />
                        <span>Not located</span>
                      </>
                    )}
                  </span>
                )}
              </div>

              {/* Claim Text */}
              <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Claim Under Review
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white break-words">
                  &quot;{displayClaimText}&quot;
                </p>
                {claimSummary?.subject && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Subject: <span className="font-medium text-slate-700 dark:text-slate-300">{claimSummary.subject}</span>
                  </p>
                )}
              </div>

              {/* Extracted vs Verified Comparison */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Extracted Value
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-white break-words">
                    {displayExtractedValue}
                  </div>
                  {(claimSummary?.normalised_value || finding.normalised_value) && (
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      Normalised: {claimSummary?.normalised_value || finding.normalised_value}
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-300/60 dark:border-purple-800/70">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 mb-1">
                    Verified Fact Value
                  </div>
                  <div className="font-mono text-sm font-bold text-purple-900 dark:text-purple-100 break-words">
                    {displayVerifiedValue}
                  </div>
                  {(claimSummary?.fact_id || finding.fact_id) && (
                    <div className="text-[11px] font-mono text-purple-700/80 dark:text-purple-300/80 mt-0.5">
                      {claimSummary?.fact_id || finding.fact_id}
                      {claimSummary?.fact_name || finding.fact_name
                        ? ` · ${claimSummary?.fact_name || finding.fact_name}`
                        : ''}
                    </div>
                  )}
                </div>
              </div>

              {/* Confidence */}
              <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Extraction Confidence
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {Math.round(displayConfidence * 100)}% deterministic confidence
                  </div>
                </div>
                <ConfidenceBar confidence={displayConfidence} />
              </div>

              {/* Verification Explanation */}
              <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Verification Finding
                </div>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {finding.reason}
                </p>
                {locateData?.matched_query && (
                  <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300 pt-1">
                    Matched PDF query: &quot;{locateData.matched_query}&quot; ({locateData.evidence_rects?.length || highlightsOnPage} box)
                  </p>
                )}
              </div>
            </div>

            {/* RIGHT PANEL: Highlighted PDF Page Image + Pagination */}
            <div className="lg:col-span-7 p-4 sm:p-6 flex flex-col bg-slate-100/60 dark:bg-slate-950/60">
              {/* Pagination Bar */}
              <div className="flex items-center justify-between gap-2 flex-wrap pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={loading || currentPage <= 1}
                    leftIcon={<ChevronLeftIcon className="w-4 h-4" />}
                  >
                    Previous
                  </Button>
                  <span
                    data-testid="evidence-page-indicator"
                    className="px-3 py-1.5 rounded-xl text-xs font-mono font-semibold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                  >
                    Page {currentPage} of {pageCount}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={loading || currentPage >= pageCount}
                    rightIcon={<ChevronRightIcon className="w-4 h-4" />}
                  >
                    Next
                  </Button>
                </div>

                {isLocated && highlightedPage && highlightedPage !== currentPage && (
                  <button
                    type="button"
                    onClick={() => handlePageChange(highlightedPage)}
                    className="text-xs font-semibold text-purple-600 dark:text-purple-300 hover:underline px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-400/30"
                  >
                    Jump to highlighted p.{highlightedPage}
                  </button>
                )}
              </div>

              {/* Not Located Banner */}
              {!loading && !error && locateData && !isLocated && (
                <div className="mb-3 p-3.5 rounded-xl bg-amber-500/15 border border-amber-400/50 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
                  <AlertTriangleIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Evidence text not located</p>
                    <p className="mt-0.5 text-amber-800/90 dark:text-amber-200/90">
                      {notLocatedReason}
                    </p>
                  </div>
                </div>
              )}

              {/* Viewer States */}
              <div className="flex-1 min-h-[320px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-200/60 dark:bg-slate-900/70 p-3 overflow-auto">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin"
                      role="status"
                      aria-label="Loading evidence PDF page"
                    />
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Rendering evidence PDF page {currentPage}...
                    </p>
                  </div>
                ) : error ? (
                  <div className="max-w-md w-full p-5 rounded-xl bg-rose-500/10 border border-rose-300 dark:border-rose-800 text-center space-y-3">
                    <AlertCircleIcon className="w-8 h-8 text-rose-500 mx-auto" />
                    <div className="text-sm font-bold text-rose-900 dark:text-rose-200">
                      Could not load evidence page
                    </div>
                    <p className="text-xs text-rose-800 dark:text-rose-300 break-words">
                      {error}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => loadLocateAndPage(currentPage, !locateData)}
                      leftIcon={<RefreshIcon className="w-3.5 h-3.5" />}
                    >
                      Retry
                    </Button>
                  </div>
                ) : imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={`Evidence PDF ${locateData?.file_name || documentId} page ${currentPage}`}
                    className="max-w-full w-auto h-auto rounded-lg shadow-lg border border-slate-300 dark:border-slate-700 bg-white"
                  />
                ) : (
                  <div className="text-center py-10 px-4 space-y-2">
                    <AlertTriangleIcon className="w-8 h-8 text-amber-500 mx-auto" />
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Evidence text not located
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {notLocatedReason}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
};


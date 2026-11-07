import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Campaign, CoherenceFinding, UserRole } from '../types';
import { GlassCard } from '../components/common/GlassCard';
import { Button } from '../components/common/Button';
import { Skeleton } from '../components/common/Skeleton';
import { showToast } from '../components/common/Toast';
import {
  LayersIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  RefreshIcon,
  SparklesIcon,
} from '../components/Icons';

export const CampaignCoherenceView: React.FC<{ currentRole: UserRole }> = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [coherenceFindings, setCoherenceFindings] = useState<CoherenceFinding[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckStats, setLastCheckStats] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      handleCheckCoherence(selectedCampaignId);
    }
  }, [selectedCampaignId]);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getCampaigns();
      setCampaigns(data);
      if (data.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckCoherence = async (targetId?: string) => {
    const cid = targetId || selectedCampaignId;
    if (!cid) return;
    try {
      setChecking(true);
      setError(null);
      const res = await api.checkCampaignCoherence(cid);
      setCoherenceFindings(res.findings || []);
      const msg = res.has_contradictions
        ? `Detected ${res.findings_count} cross-channel contradiction(s).`
        : 'All channels coherent. No offer contradictions.';
      setLastCheckStats(msg);
      if (res.has_contradictions) {
        showToast({ type: 'warning', title: 'Coherence Conflict', message: msg });
      } else {
        showToast({ type: 'success', title: 'Coherence Verified', message: msg });
      }
    } catch (err: any) {
      const msg = err.message || 'Campaign coherence check failed';
      setError(msg);
      showToast({ type: 'error', title: 'Check Failed', message: msg });
    } finally {
      setChecking(false);
    }
  };

  const currentCamp = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <GlassCard className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <LayersIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
              Campaign Coherence Lite
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>Cross-Channel Engine</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Deterministic cross-channel contradiction detector: flags conflicting discounts and claims across collateral with zero LLM variance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="text-xs sm:text-sm border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 bg-white/80 dark:bg-slate-950/80 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
          >
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.status})
              </option>
            ))}
          </select>

          <Button
            variant="primary"
            size="sm"
            onClick={() => handleCheckCoherence()}
            disabled={checking || !selectedCampaignId}
            isLoading={checking}
            leftIcon={<RefreshIcon className="w-4 h-4" />}
          >
            {checking ? 'Analyzing...' : 'Check Coherence'}
          </Button>
        </div>
      </GlassCard>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs animate-in fade-in">
          {error}
        </div>
      )}

      {lastCheckStats && (
        <div className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center space-x-2.5 animate-in fade-in ${
          coherenceFindings.length > 0
            ? 'bg-amber-500/15 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
            : 'bg-emerald-500/15 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
        }`}>
          {coherenceFindings.length > 0 ? (
            <AlertTriangleIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : (
            <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          )}
          <span className="font-semibold">{lastCheckStats}</span>
        </div>
      )}

      {/* Campaign Info Card */}
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

      {/* Coherence Conflict Findings */}
      <GlassCard className="overflow-hidden">
        <div className="p-4 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
          <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
            Cross-Channel Coherence Findings ({coherenceFindings.length})
          </span>
          <span className="text-xs text-slate-400">Deterministic Pairwise &amp; Attribute Match</span>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            <Skeleton className="h-6 w-full" count={3} />
          </div>
        ) : coherenceFindings.length === 0 ? (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400">
            <CheckCircleIcon className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-slate-800 dark:text-slate-200">No cross-channel contradictions detected.</p>
            <p className="text-xs text-slate-400 mt-1">
              Click &quot;Check Coherence&quot; to scan all assets in this campaign for conflicting values.
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
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Campaign, CoherenceFinding, UserRole } from '../types';
import { LayersIcon, AlertTriangleIcon, CheckCircleIcon, RefreshIcon, SparklesIcon } from '../components/Icons';

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

  const handleCheckCoherence = async () => {
    if (!selectedCampaignId) return;
    try {
      setChecking(true);
      setError(null);
      const res = await api.checkCampaignCoherence(selectedCampaignId);
      setCoherenceFindings(res.findings || []);
      setLastCheckStats(
        res.has_contradictions
          ? `Detected ${res.findings_count} cross-channel contradiction(s).`
          : 'All channels coherent. No offer contradictions.'
      );
    } catch (err: any) {
      setError(err.message || 'Campaign coherence check failed');
    } finally {
      setChecking(false);
    }
  };

  const currentCamp = campaigns.find(c => c.id === selectedCampaignId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <LayersIcon className="w-5 h-5 text-purple-600" />
            <h1 className="text-xl font-bold text-slate-900">Campaign Coherence Lite</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">
              Named Improvement #2
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Deterministic cross-channel contradiction detector: flags conflicting discounts and claims across channels with zero LLM variance.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
          >
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.status})
              </option>
            ))}
          </select>

          <button
            onClick={handleCheckCoherence}
            disabled={checking || !selectedCampaignId}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 transition shadow-sm"
          >
            <RefreshIcon className={`w-4 h-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Analyzing...' : 'Check Coherence'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      {lastCheckStats && (
        <div className={`p-3 rounded-lg border text-sm flex items-center space-x-2 ${
          coherenceFindings.length > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          {coherenceFindings.length > 0 ? (
            <AlertTriangleIcon className="w-4 h-4 text-amber-600" />
          ) : (
            <CheckCircleIcon className="w-4 h-4 text-emerald-600" />
          )}
          <span className="font-medium">{lastCheckStats}</span>
        </div>
      )}

      {/* Campaign Info Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Campaign Baseline Offer
          </span>
          <span className="text-xs font-mono px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold">
            Single Source of Truth
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{currentCamp?.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{currentCamp?.description || 'Active promotional campaign'}</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-400 block">Approved Campaign Offer:</span>
            <span className="text-base font-bold text-purple-700 font-mono bg-purple-50 px-3 py-1 rounded-lg border border-purple-200">
              {currentCamp?.approved_offer || 'None specified'}
            </span>
          </div>
        </div>
      </div>

      {/* Coherence Conflict Findings */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">
            Cross-Channel Coherence Findings ({coherenceFindings.length})
          </span>
          <span className="text-xs text-slate-400">Deterministic Pairwise & Attribute Match</span>
        </div>

        {coherenceFindings.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <CheckCircleIcon className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
            <p className="font-medium text-slate-700">No cross-channel contradictions detected.</p>
            <p className="text-xs text-slate-400 mt-1">
              Click "Check Coherence" to scan all assets in this campaign for conflicting values.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {coherenceFindings.map((cf, idx) => (
              <div key={idx} className="p-4 hover:bg-slate-50/50 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300">
                      High Tier Conflict
                    </span>
                    <span className="text-sm font-bold text-slate-900">{cf.content_title}</span>
                    <span className="text-xs font-mono px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                      Channel: {cf.channel}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    Contradicting Value: {cf.this_value}
                  </span>
                </div>

                <p className="text-sm text-slate-700 mt-2 font-medium">{cf.reason}</p>

                <div className="mt-3 p-2.5 bg-slate-50 rounded-lg text-xs text-slate-600 flex items-center justify-between border border-slate-200">
                  <span>Subject: <strong className="text-slate-800">{cf.subject}</strong> · Attribute: <strong className="text-slate-800">{cf.attribute}</strong></span>
                  <span>Conflicting Values Detected: <strong className="text-purple-700 font-mono">[{cf.all_values.join(', ')}]</strong></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


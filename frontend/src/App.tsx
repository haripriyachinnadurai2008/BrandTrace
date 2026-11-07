import React, { useState } from 'react';
import { UserRole } from './types';
import { isMissingApiUrl, API_BASE_URL } from './api/client';
import { RoleNav } from './components/RoleNav';
import { FindingsView } from './pages/FindingsView';
import { ImpactListView } from './pages/ImpactListView';
import { TruthGraphView } from './pages/TruthGraphView';
import { CampaignCoherenceView } from './pages/CampaignCoherenceView';
import { PrecedentsView } from './pages/PrecedentsView';
import { AuditHistoryView } from './pages/AuditHistoryView';

export function App() {
  const [activeTab, setActiveTab] = useState<string>('findings');
  const [currentRole, setCurrentRole] = useState<UserRole>('Admin');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans text-slate-900">
      {/* Top Navbar */}
      <RoleNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentRole={currentRole}
        setCurrentRole={setCurrentRole}
      />

      {/* API URL Configuration Warning Banner */}
      {isMissingApiUrl && (
        <div className="bg-red-600 text-white px-4 py-3 text-center text-sm font-semibold shadow-md flex items-center justify-center space-x-2">
          <span>⚠️ Configuration Error: <code>VITE_API_BASE_URL</code> is not set for production. Please add <code>VITE_API_BASE_URL</code> in the Render static site Environment tab (e.g. <code>https://brandtrace.onrender.com</code>) and trigger a new deploy.</span>
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'findings' && <FindingsView currentRole={currentRole} />}
        {activeTab === 'impact' && <ImpactListView currentRole={currentRole} />}
        {activeTab === 'facts' && <TruthGraphView currentRole={currentRole} />}
        {activeTab === 'campaigns' && <CampaignCoherenceView currentRole={currentRole} />}
        {activeTab === 'precedents' && <PrecedentsView currentRole={currentRole} />}
        {activeTab === 'audit' && <AuditHistoryView currentRole={currentRole} />}
      </main>

      {/* Footer with Compliance, Principle, and Asia/Kolkata Clock */}
      <footer className="border-t border-slate-200 bg-white py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>BrandTrace</strong> · Inkloom AI Brand Governance Challenge (Round 2) ·{' '}
            <span className="font-semibold text-purple-700">
              Principle: The LLM extracts, the backend verifies, humans decide.
            </span>
          </div>
          <div className="flex items-center space-x-4 font-mono text-[11px]">
            <span>Active Role: <strong className="text-slate-800">{currentRole}</strong></span>
            <span>TZ: <strong className="text-slate-800">Asia/Kolkata (IST)</strong></span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;

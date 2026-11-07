import React, { useState, useEffect } from 'react';
import { UserRole } from './types';
import { isMissingApiUrl } from './api/client';
import { ThemeProvider } from './context/ThemeContext';
import { RouterProvider, useRouter } from './router/Router';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { AppSidebar } from './components/AppSidebar';
import { AppHeader } from './components/AppHeader';
import { FindingsView } from './pages/FindingsView';
import { ImpactListView } from './pages/ImpactListView';
import { TruthGraphView } from './pages/TruthGraphView';
import { CampaignCoherenceView } from './pages/CampaignCoherenceView';
import { PrecedentsView } from './pages/PrecedentsView';
import { AuditHistoryView } from './pages/AuditHistoryView';
import { ToastContainer } from './components/common/Toast';

const AppContent: React.FC = () => {
  const { path, tab, navigate } = useRouter();
  const [currentRole, setCurrentRole] = useState<UserRole>('Admin');
  const [activeTab, setActiveTab] = useState<string>(tab || 'findings');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  // Synchronize router tab param with activeTab state
  useEffect(() => {
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [tab]);

  // Route 1: Public Landing Page
  if (path === '/') {
    return (
      <>
        <LandingPage />
        <ToastContainer />
      </>
    );
  }

  // Route 2: Public Login Portal
  if (path === '/login') {
    return (
      <>
        <LoginPage />
        <ToastContainer />
      </>
    );
  }

  // Route 3: Protected Governance Application Suite with Professional Sidebar Layout
  return (
    <div className="min-h-screen flex text-slate-900 dark:text-slate-100 transition-colors selection:bg-purple-500 selection:text-white">
      {/* Left Vertical Navigation Sidebar */}
      <AppSidebar
        activeTab={activeTab}
        setActiveTab={(newTab) => {
          setActiveTab(newTab);
          navigate(`/app/${newTab}`);
        }}
        currentRole={currentRole}
        setCurrentRole={setCurrentRole}
        isOpenMobile={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top Header */}
        <AppHeader
          activeTab={activeTab}
          currentRole={currentRole}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />

        {/* API Configuration Warning Banner */}
        {isMissingApiUrl && (
          <div className="bg-rose-600 text-white px-4 py-3 text-center text-xs sm:text-sm font-semibold shadow-md flex items-center justify-center space-x-2">
            <span>⚠️ Configuration Error: <code>VITE_API_BASE_URL</code> is not set. Please add <code>VITE_API_BASE_URL</code> in Render and redeploy.</span>
          </div>
        )}

        {/* Dynamic Viewport */}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {activeTab === 'findings' && <FindingsView currentRole={currentRole} />}
          {activeTab === 'impact' && <ImpactListView currentRole={currentRole} />}
          {activeTab === 'facts' && <TruthGraphView currentRole={currentRole} />}
          {activeTab === 'campaigns' && <CampaignCoherenceView currentRole={currentRole} />}
          {activeTab === 'precedents' && <PrecedentsView currentRole={currentRole} />}
          {activeTab === 'audit' && <AuditHistoryView currentRole={currentRole} />}
        </main>

        {/* Clean Footer */}
        <footer className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-950/80 backdrop-blur-md py-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>
              <strong>BrandTrace</strong> · Inkloom AI Brand Governance Challenge (Round 2) ·{' '}
              <span className="font-semibold text-purple-700 dark:text-purple-400">
                Principle: The LLM extracts, the backend verifies, humans decide.
              </span>
            </div>
            <div className="flex items-center space-x-4 font-mono text-[11px]">
              <span>Active Role: <strong className="text-slate-800 dark:text-slate-200">{currentRole}</strong></span>
              <span>TZ: <strong className="text-slate-800 dark:text-slate-200">Asia/Kolkata (IST)</strong></span>
            </div>
          </div>
        </footer>
      </div>

      {/* Global Toast Container */}
      <ToastContainer />
    </div>
  );
};

export function App() {
  return (
    <ThemeProvider>
      <RouterProvider>
        <AppContent />
      </RouterProvider>
    </ThemeProvider>
  );
}

export default App;

import React, { useState, useEffect } from 'react';
import { UserRole } from './types';
import { api, isMissingApiUrl } from './api/client';
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
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { ClockIcon } from './components/Icons';

const AppContent: React.FC = () => {
  const { path, tab, navigate } = useRouter();
  const [currentRole, setCurrentRole] = useState<UserRole>(() => api.getRole());
  const [activeTab, setActiveTab] = useState<string>(tab || 'findings');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);
  const [serverWaking, setServerWaking] = useState<boolean>(false);

  // Keep React role state synchronized with JWT/session single source of truth
  useEffect(() => {
    setCurrentRole(api.getRole());
  }, [path]);

  useEffect(() => {
    const unsubSession = api.onSessionChange((session) => {
      setCurrentRole(session.role);
    });
    const unsubWaking = api.onServerWaking((waking) => {
      setServerWaking(waking);
    });

    // Warm up Render free tier on initial load & keep alive while tab is visible
    api.pingHealth();
    const keepAliveId = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        api.pingHealth();
      }
    }, 4 * 60 * 1000);

    return () => {
      unsubSession();
      unsubWaking();
      window.clearInterval(keepAliveId);
    };
  }, []);

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
        {serverWaking && (
          <div
            role="status"
            aria-live="polite"
            className="bg-amber-50/95 dark:bg-amber-950/90 border-b border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2"
          >
            <ClockIcon className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Backend server is waking up (free tier takes ~30–50s)...</span>
          </div>
        )}
        {isMissingApiUrl && (
          <div className="bg-rose-600 text-white px-4 py-2.5 text-center text-xs sm:text-sm font-semibold shadow-md">
            ⚠️ Configuration Error: <code>VITE_API_BASE_URL</code> is not set in production.
          </div>
        )}
        <LandingPage />
        <ToastContainer />
      </>
    );
  }

  // Route 2: Public Login Portal
  if (path === '/login') {
    return (
      <>
        {serverWaking && (
          <div
            role="status"
            aria-live="polite"
            className="bg-amber-50/95 dark:bg-amber-950/90 border-b border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2"
          >
            <ClockIcon className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Backend server is waking up (free tier takes ~30–50s)...</span>
          </div>
        )}
        {isMissingApiUrl && (
          <div className="bg-rose-600 text-white px-4 py-2.5 text-center text-xs sm:text-sm font-semibold shadow-md">
            ⚠️ Configuration Error: <code>VITE_API_BASE_URL</code> is not set in production.
          </div>
        )}
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
          onRoleChange={setCurrentRole}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />

        {/* Server Waking Up Banner (Render Free Tier Cold Start) */}
        {serverWaking && (
          <div
            role="status"
            aria-live="polite"
            className="bg-amber-50/95 dark:bg-amber-950/90 border-b border-amber-200 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 px-4 py-2 text-xs font-medium flex items-center justify-center gap-2"
          >
            <ClockIcon className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              Backend server is waking up (free tier takes ~30–50s). Keeping connection active...
            </span>
          </div>
        )}

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
              <strong>BrandTrace</strong> · Inkloom AI Brand Governance Challenge (Round 3) ·{' '}
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
    <ErrorBoundary>
      <ThemeProvider>
        <RouterProvider>
          <AppContent />
        </RouterProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

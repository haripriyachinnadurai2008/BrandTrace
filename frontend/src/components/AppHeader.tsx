import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import { useRouter } from '../router/Router';
import { api } from '../api/client';
import { ThemeToggle } from './ThemeToggle';
import { showToast } from './common/Toast';
import {
  MenuIcon,
  LogOutIcon,
  SparklesIcon,
  LockIcon,
} from './Icons';

interface AppHeaderProps {
  activeTab: string;
  currentRole: UserRole;
  onRoleChange?: (newRole: UserRole) => void;
  onOpenMobileSidebar: () => void;
}

const tabTitles: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: '0. Governance Dashboard', subtitle: 'Live Brand Compliance & Ground-Truth Health' },
  findings: { title: '1. Content Findings & Fixes', subtitle: 'AI Extraction & Verification Gate' },
  impact: { title: '2. Change Impact Blast Radius', subtitle: 'Atomic Downstream Cascade' },
  facts: { title: '3. Brand Truth Graph', subtitle: 'Single-Source-of-Truth Version Timeline' },
  campaigns: { title: '4. Campaign Coherence Lite', subtitle: 'Cross-Channel Conflict Detector' },
  precedents: { title: '5. Living Guidelines Precedents', subtitle: 'Institutional Memory & Overrides' },
  audit: { title: '6. Governance Audit Trail', subtitle: 'Trigger-Enforced Append-Only Ledger' },
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  activeTab,
  currentRole,
  onRoleChange,
  onOpenMobileSidebar,
}) => {
  const { navigate } = useRouter();
  const currentInfo = tabTitles[activeTab] || { title: 'BrandTrace Governance', subtitle: 'Compliance Engine' };

  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [switchingRole, setSwitchingRole] = useState<boolean>(false);

  useEffect(() => {
    api.getPublicConfig().then(cfg => {
      setDemoMode(Boolean(cfg && cfg.demo_mode));
    }).catch(() => {
      setDemoMode(false);
    });
  }, []);

  const handleSwitchDemoRole = async (targetRole: UserRole) => {
    if (targetRole === currentRole || switchingRole) return;
    try {
      setSwitchingRole(true);
      await api.demoLogin(targetRole.toLowerCase());
      const canonicalRole = api.getRole();
      if (onRoleChange) {
        onRoleChange(canonicalRole);
      }
      showToast({
        type: 'info',
        title: 'Demo Role Switched',
        message: `Session active as ${canonicalRole} via demo login.`,
      });
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Role Switch Failed',
        message: err.message || 'Failed to switch demo role',
      });
    } finally {
      setSwitchingRole(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    navigate('/');
  };

  const demoRoles: UserRole[] = ['Admin', 'Creator', 'Reviewer', 'Agency'];

  return (
    <header className="sticky top-0 z-20 backdrop-blur-xl bg-white/75 dark:bg-slate-950/80 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Mobile Menu Toggle + Breadcrumbs */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onOpenMobileSidebar}
            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition border border-slate-200 dark:border-slate-800"
            aria-label="Open Navigation Sidebar"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono text-purple-600 dark:text-purple-400 font-bold hidden sm:inline">
                BrandTrace /
              </span>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                {currentInfo.title}
              </h2>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden md:block">
              {currentInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Right: Demo Controls + Principle Tag + Role + Actions */}
        <div className="flex items-center space-x-3">
          {/* Demo mode badge & role switcher */}
          {demoMode && (
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/80 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>Demo mode</span>
              </div>

              {/* Demo Role Switcher */}
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 text-[11px]">
                {demoRoles.map(r => {
                  const isActive = currentRole === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      disabled={switchingRole}
                      onClick={() => handleSwitchDemoRole(r)}
                      className={`px-2 sm:px-2.5 py-1 rounded-lg font-semibold transition-all duration-150 ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400'
                      } ${switchingRole ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Principle pill */}
          {!demoMode && (
            <div className="hidden xl:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>LLM extracts · Backend verifies · Humans decide</span>
            </div>
          )}

          {/* User Role Badge (shown when not in demo mode) */}
          {!demoMode && (
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 text-xs font-mono border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400">Role:</span>
              <span className="font-bold text-slate-900 dark:text-white">{currentRole}</span>
            </div>
          )}

          <ThemeToggle />

          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition border border-transparent hover:border-rose-200 dark:hover:border-rose-900/40"
            aria-label="Sign Out"
          >
            <LogOutIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};


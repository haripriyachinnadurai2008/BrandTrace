import React, { useState, useEffect } from 'react';
import { UserRole, Notification } from '../types';
import { api } from '../api/client';
import { useRouter } from '../router/Router';
import { ThemeToggle } from './ThemeToggle';
import {
  ShieldCheckIcon,
  BellIcon,
  FileTextIcon,
  GitCommitIcon,
  LayersIcon,
  HistoryIcon,
  SparklesIcon,
  LogOutIcon,
  UserIcon,
  XIcon,
} from './Icons';

interface AppSidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  activeTab,
  setActiveTab,
  currentRole,
  setCurrentRole,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const { navigate } = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState<boolean>(false);

  const isRoleSwitcherAllowed =
    import.meta.env.VITE_ALLOW_ROLE_SWITCHER !== 'false' &&
    import.meta.env.MODE !== 'production';

  useEffect(() => {
    loadNotifications();
  }, [currentRole]);

  const loadNotifications = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data || []);
    } catch {
      // silently ignore
    }
  };

  const handleLogout = () => {
    api.logout();
    navigate('/');
  };

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    navigate(`/app/${tabId}`);
    if (onCloseMobile) onCloseMobile();
  };

  const roles: UserRole[] = ['Admin', 'Creator', 'Reviewer', 'Agency'];

  const navItems = [
    { id: 'findings', label: '1. Content Findings', icon: FileTextIcon, desc: 'AI parsing & fixes' },
    { id: 'impact', label: '2. Change Impact', icon: SparklesIcon, desc: 'Blast radius cascade' },
    { id: 'facts', label: '3. Truth Graph', icon: GitCommitIcon, desc: 'Fact version timeline' },
    { id: 'campaigns', label: '4. Campaign Coherence', icon: LayersIcon, desc: 'Cross-channel checks' },
    { id: 'precedents', label: '5. Precedents', icon: HistoryIcon, desc: 'Living guidelines memory' },
    { id: 'audit', label: '6. Audit Trail', icon: ShieldCheckIcon, desc: 'Append-only ledger' },
  ];

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between p-4 sm:p-5 select-none">
      {/* Top Brand Section */}
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-between">
          <div
            className="flex items-center space-x-3 cursor-pointer group"
            onClick={() => navigate('/')}
            title="Go to Landing Page"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-700 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-600/25 group-hover:scale-105 transition-transform">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">
                  BrandTrace
                </span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-semibold border border-purple-200 dark:border-purple-800">
                  Gov 2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                Git for brand facts
              </p>
            </div>
          </div>

          {/* Close button for mobile drawer */}
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              aria-label="Close Sidebar"
            >
              <XIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Section */}
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 px-3 mb-2">
            Governance Navigation
          </div>

          <nav className="space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25 dark:bg-purple-600'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                    <span className="tracking-tight text-left">{item.label}</span>
                  </div>
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Development Role Switcher */}
        {isRoleSwitcherAllowed && (
          <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase">
              <span>Dev Role Switcher</span>
              <span className="text-[10px] text-purple-600 dark:text-purple-400">Local Only</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {roles.map(r => {
                const isActive = currentRole === r;
                return (
                  <button
                    key={r}
                    onClick={() => {
                      setCurrentRole(r);
                      api.setRole(r);
                    }}
                    className={`px-2 py-1 text-xs font-semibold rounded-lg transition ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-white/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Profile, Notifications & Controls */}
      <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
        {/* User Card */}
        <div className="p-3 rounded-xl bg-slate-100/60 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-purple-600/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs shrink-0">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className="truncate text-left">
              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {currentRole} User
              </div>
              <div className="text-[10px] font-mono text-purple-600 dark:text-purple-400 truncate">
                JWT Session
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            <ThemeToggle className="min-h-[36px] min-w-[36px] p-1.5 rounded-lg" />
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
              aria-label="Sign Out"
            >
              <LogOutIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notifications shortcut banner */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 transition border border-slate-200/60 dark:border-slate-800/60"
          >
            <div className="flex items-center space-x-2">
              <BellIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span>Notifications</span>
            </div>
            {unreadCount > 0 ? (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                {unreadCount}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400 font-mono">0 new</span>
            )}
          </button>

          {/* Notification Popover */}
          {notifOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-72 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 backdrop-blur-2xl p-4 z-50 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Notifications ({notifications.length})
                </span>
                <button
                  onClick={() => setNotifOpen(false)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  Close
                </button>
              </div>

              <div className="mt-2 max-h-56 overflow-y-auto space-y-2 pr-1">
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No new notifications.</p>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/60 text-xs"
                    >
                      <div className="font-bold text-slate-900 dark:text-white">{n.title}</div>
                      <div className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed text-[11px]">
                        {n.message}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Public Landing Link */}
        <button
          onClick={() => navigate('/')}
          className="w-full text-center text-[11px] font-medium text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition"
        >
          ← Return to Public Landing Page
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex w-64 xl:w-72 shrink-0 min-h-screen sticky top-0 border-r border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-950/80 backdrop-blur-2xl z-30 flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity animate-in fade-in"
            onClick={onCloseMobile}
          />

          {/* Drawer Panel */}
          <div className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-950 shadow-2xl z-10 flex flex-col h-full animate-in slide-in-from-left duration-200 border-r border-slate-200 dark:border-slate-800">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};


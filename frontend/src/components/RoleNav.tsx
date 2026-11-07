import React, { useState, useEffect } from 'react';
import { UserRole, Notification } from '../types';
import { api } from '../api/client';
import { useRouter } from '../router/Router';
import { ThemeToggle } from './ThemeToggle';
import { LoginModal } from './LoginModal';
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
} from './Icons';

interface RoleNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
}

export const RoleNav: React.FC<RoleNavProps> = ({
  activeTab,
  setActiveTab,
  currentRole,
  setCurrentRole,
}) => {
  const { navigate } = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState<boolean>(false);
  const [loginOpen, setLoginOpen] = useState<boolean>(false);

  // Check if role switcher is permitted by environment
  const isRoleSwitcherAllowed =
    import.meta.env.VITE_ALLOW_ROLE_SWITCHER !== 'false' &&
    import.meta.env.MODE !== 'production';

  useEffect(() => {
    loadNotifications();
  }, [currentRole]);

  useEffect(() => {
    const unsubscribe = api.onAuthError(() => {
      navigate('/login');
    });
    return unsubscribe;
  }, [navigate]);

  const loadNotifications = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data || []);
    } catch {
      // silently ignore if notifications endpoint is idle
    }
  };

  const handleLogout = () => {
    api.logout();
    navigate('/');
  };

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    navigate(`/app/${tabId}`);
  };

  const roles: UserRole[] = ['Admin', 'Creator', 'Reviewer', 'Agency'];

  const navItems = [
    { id: 'findings', label: '1. Content Findings', icon: FileTextIcon },
    { id: 'impact', label: '2. Change Impact', icon: SparklesIcon },
    { id: 'facts', label: '3. Truth Graph', icon: GitCommitIcon },
    { id: 'campaigns', label: '4. Campaign Coherence', icon: LayersIcon },
    { id: 'precedents', label: '5. Precedents', icon: HistoryIcon },
    { id: 'audit', label: '6. Audit Trail', icon: ShieldCheckIcon },
  ];

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/75 dark:bg-slate-950/80 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
      {/* Top Brand & Controls Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Subtitle */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-700 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-600/20">
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
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden sm:block">
                LLM extracts · Backend verifies · Humans decide
              </p>
            </div>
          </div>

          {/* Right Action Tools: Role Switcher / User Pill + Bell + ThemeToggle + SignOut */}
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            {isRoleSwitcherAllowed ? (
              /* Local Dev Role Switcher Pills */
              <div className="flex items-center bg-slate-100/90 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-[11px] font-bold text-slate-400 px-2 hidden md:inline uppercase">
                  Role:
                </span>
                {roles.map(r => {
                  const isActive = currentRole === r;
                  return (
                    <button
                      key={r}
                      onClick={() => {
                        setCurrentRole(r);
                        api.setRole(r);
                      }}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800'
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Production Authenticated User Pill */
              <div className="flex items-center space-x-2 bg-slate-100/80 dark:bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
                <div className="w-6 h-6 rounded-full bg-purple-600/20 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs">
                  <UserIcon className="w-3.5 h-3.5" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                    {currentRole}
                  </span>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-mono">
                    JWT Session
                  </span>
                </div>
              </div>
            )}

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-900 transition border border-transparent hover:border-slate-200 dark:hover:border-slate-800"
                aria-label="View notifications"
              >
                <BellIcon className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white dark:ring-slate-950 animate-pulse" />
                )}
              </button>

              {/* Notification Drawer */}
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white/95 dark:bg-slate-900/95 text-slate-900 dark:text-white rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 backdrop-blur-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
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

                  <div className="mt-2 max-h-64 overflow-y-auto space-y-2 pr-1">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-400 py-6 text-center">No new notifications.</p>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className="p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/60 text-xs"
                        >
                          <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                            <span>{n.title}</span>
                            <span className="text-[10px] font-mono text-slate-400">IST</span>
                          </div>
                          <div className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                            {n.message}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Dark / Light Mode Toggle */}
            <ThemeToggle />

            {/* Sign Out Button */}
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-2.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition border border-transparent hover:border-rose-200 dark:hover:border-rose-900/50"
              aria-label="Sign Out"
            >
              <LogOutIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="bg-slate-100/50 dark:bg-slate-950/60 border-t border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 overflow-x-auto py-1.5 scrollbar-none">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`flex items-center px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-900/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 mr-1.5 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Dev Login Modal */}
      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoginSuccess={(role) => {
          setCurrentRole(role);
          loadNotifications();
        }}
      />
    </header>
  );
};

import React, { useState, useEffect } from 'react';
import { UserRole, Notification } from '../types';
import { api } from '../api/client';
import { LoginModal } from './LoginModal';
import {
  ShieldCheckIcon,
  BellIcon,
  FileTextIcon,
  GitCommitIcon,
  LayersIcon,
  HistoryIcon,
  SparklesIcon,
  CheckCircleIcon
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
      setLoginOpen(true);
    });
    return unsubscribe;
  }, []);

  const loadNotifications = async () => {
    try {
      const data = await api.getNotifications();
      setNotifications(data || []);
    } catch {
      // silently ignore if notifications endpoint is idle
    }
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
    <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40">
      {/* Top Brand & Role Switcher Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Subtitle */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-md">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white font-sans">
                  BrandTrace
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                  Round 2 Prototype
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Git for brand facts: LLM extracts, backend verifies, humans decide.
              </p>
            </div>
          </div>

          {/* Role Switcher & Notifications */}
          <div className="flex items-center space-x-3">
            {isRoleSwitcherAllowed ? (
              /* Development Role Switcher Pill */
              <div className="flex items-center bg-slate-800/80 p-1 rounded-lg border border-slate-700">
                <span className="text-xs font-semibold text-slate-400 px-2 hidden sm:inline">Role:</span>
                {roles.map(r => {
                  const isActive = currentRole === r;
                  return (
                    <button
                      key={r}
                      onClick={() => {
                        setCurrentRole(r);
                        api.setRole(r);
                      }}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
                <button
                  onClick={() => setLoginOpen(true)}
                  title="Test JWT Auth"
                  className="ml-1 px-2 py-1 text-[11px] font-semibold text-purple-300 hover:text-white hover:bg-purple-900/40 rounded border border-purple-700/50"
                >
                  JWT Login
                </button>
              </div>
            ) : (
              /* Production Authenticated User Pill (Role Switcher Disabled) */
              <div className="flex items-center space-x-2 bg-slate-800/90 px-3 py-1.5 rounded-lg border border-slate-700">
                <div className="flex flex-col text-right">
                  <span className="text-xs font-bold text-white leading-tight">
                    {currentRole} User
                  </span>
                  <span className="text-[10px] text-purple-400 font-mono">
                    JWT Session
                  </span>
                </div>
                <button
                  onClick={() => setLoginOpen(true)}
                  className="ml-1 px-2.5 py-1 text-xs font-medium rounded bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition"
                >
                  Sign In
                </button>
              </div>
            )}

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <BellIcon className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-slate-900" />
                )}
              </button>

              {/* Notification Drawer */}
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 p-4 z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Notifications ({notifications.length})
                    </span>
                    <button
                      onClick={() => setNotifOpen(false)}
                      className="text-xs text-slate-400 hover:text-slate-600"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mt-2 max-h-60 overflow-y-auto space-y-2">
                    {notifications.length === 0 ? (
                      <p className="text-xs text-slate-400 py-4 text-center">No notifications.</p>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className="p-2.5 rounded-lg border border-slate-100 bg-slate-50 text-xs"
                        >
                          <div className="font-bold text-slate-900">{n.title}</div>
                          <div className="text-slate-600 mt-0.5">{n.message}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="bg-slate-950 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 overflow-x-auto py-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                    isActive
                      ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 mr-1.5 ${isActive ? 'text-purple-400' : 'text-slate-500'}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Production JWT Login Modal */}
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


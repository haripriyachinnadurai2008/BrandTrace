import React, { useState } from 'react';
import { UserRole } from '../types';
import { api } from '../api/client';
import { ShieldCheckIcon } from './Icons';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (role: UserRole, user: any) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('admin@aura-audio.com');
  const [password, setPassword] = useState('BrandTrace2026!');
  const [role, setRole] = useState<UserRole>('Creator');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const demoAccounts = [
    { role: 'Admin' as UserRole, name: 'Elena Vance', email: 'admin@aura-audio.com', badge: 'Full Access' },
    { role: 'Creator' as UserRole, name: 'Marcus Brody', email: 'creator@aura-audio.com', badge: 'Draft & Publish' },
    { role: 'Reviewer' as UserRole, name: 'Devin Chen', email: 'reviewer@aura-audio.com', badge: 'Approve & Precedent' },
    { role: 'Agency' as UserRole, name: 'Partner Agency', email: 'agency@partner.com', badge: 'Campaign Scoped' },
  ];

  const handleLogin = async (loginEmail?: string) => {
    setLoading(true);
    setError(null);
    const targetEmail = loginEmail || email;
    try {
      const res = await api.login(targetEmail, password);
      onLoginSuccess(res.user.role as UserRole, res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.register(name, email, password, role);
      onLoginSuccess(res.user.role as UserRole, res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center text-white">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 font-sans">
                {isRegisterMode ? 'Create BrandTrace Account' : 'BrandTrace Login'}
              </h2>
              <p className="text-xs text-slate-500">
                {isRegisterMode ? 'Register a new authenticated role' : 'Production JWT Authentication'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1"
          >
            &times;
          </button>
        </div>

        {/* Tab switcher: Login / Register */}
        <div className="flex border-b border-slate-200 mt-2">
          <button
            type="button"
            onClick={() => { setIsRegisterMode(false); setError(null); }}
            className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition ${
              !isRegisterMode
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegisterMode(true); setError(null); }}
            className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition ${
              isRegisterMode
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Register New Account
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            {error}
          </div>
        )}

        {/* 1-Click Demo Login for Evaluators (Sign In mode only) */}
        {!isRegisterMode && (
          <div className="mt-4">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
              1-Click Seeded Demo Logins
            </label>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map(acc => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => {
                    setEmail(acc.email);
                    handleLogin(acc.email);
                  }}
                  className="text-left p-2.5 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/50 transition group flex flex-col"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-purple-700">
                      {acc.role}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                      {acc.badge}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 truncate mt-0.5">{acc.email}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Credentials Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isRegisterMode) {
              handleRegister();
            } else {
              handleLogin();
            }
          }}
          className={`space-y-3 ${!isRegisterMode ? 'mt-5 pt-4 border-t border-slate-100' : 'mt-4'}`}
        >
          {isRegisterMode && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="Admin">Admin (Full System Access)</option>
                  <option value="Creator">Creator (Draft & Verification)</option>
                  <option value="Reviewer">Reviewer (Approve & Overrides)</option>
                  <option value="Agency">Agency (Campaign Scoped)</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">Password</label>
              {!isRegisterMode && <span className="text-[10px] font-mono text-purple-600">Default: BrandTrace2026!</span>}
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs transition disabled:opacity-50"
          >
            {loading ? (isRegisterMode ? 'Registering...' : 'Authenticating...') : (isRegisterMode ? 'Create Account & Sign In' : 'Sign In with JWT')}
          </button>
        </form>
      </div>
    </div>
  );
};


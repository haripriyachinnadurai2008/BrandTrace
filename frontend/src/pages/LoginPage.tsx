import React, { useState, useEffect } from 'react';
import { useRouter } from '../router/Router';
import { api, API_BASE_URL } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { GlassCard } from '../components/common/GlassCard';
import { Button } from '../components/common/Button';
import {
  ShieldCheckIcon,
  ShieldAlertIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  SparklesIcon,
  ChevronDownIcon,
  UserIcon,
} from '../components/Icons';

export const LoginPage: React.FC = () => {
  const { navigate } = useRouter();
  useTheme();

  const [email, setEmail] = useState<string>('admin@aura-audio.com');
  const [password, setPassword] = useState<string>('BrandTrace2026!');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [demoAccountsOpen, setDemoAccountsOpen] = useState<boolean>(true);

  // If already authenticated, redirect to /app/findings
  useEffect(() => {
    if (api.getToken()) {
      navigate('/app/findings');
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      await api.login(email.trim(), password);
      navigate('/app/findings');
    } catch (err: any) {
      const msg = err.message || 'Login failed';
      if (msg.includes('Cannot reach backend') || msg.includes('Failed to fetch')) {
        setErrorMsg(`Cannot reach backend server at ${API_BASE_URL}. The free tier may be waking up (please wait 30-60s) or check network connection.`);
      } else if (msg.includes('401') || msg.includes('user not found') || msg.includes('Invalid credentials')) {
        setErrorMsg(err.message || 'Invalid credentials: user not found or incorrect password. (Use default demo accounts: admin@aura-audio.com with BrandTrace2026!)');
      } else if (msg.includes('403')) {
        setErrorMsg('Access forbidden: your account does not have sign-in permissions.');
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const selectDemoAccount = (accEmail: string, accPass: string) => {
    setEmail(accEmail);
    setPassword(accPass);
    setErrorMsg(null);
  };

  const demoAccounts = [
    {
      role: 'Admin',
      name: 'Elena Vance',
      email: 'admin@aura-audio.com',
      pass: 'BrandTrace2026!',
      desc: 'Full authority: create/edit facts, execute blast radius, sign off live status.',
      badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300 dark:border-purple-800',
    },
    {
      role: 'Creator',
      name: 'Marcus Brody',
      email: 'creator@aura-audio.com',
      pass: 'BrandTrace2026!',
      desc: 'Author collateral, run extraction, view evidence, request review.',
      badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    },
    {
      role: 'Reviewer',
      name: 'Devin Chen',
      email: 'reviewer@aura-audio.com',
      pass: 'BrandTrace2026!',
      desc: 'Verify claims, apply living guidelines precedents, approve fixes.',
      badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    },
    {
      role: 'Agency',
      name: 'Partner Agency',
      email: 'agency@partner.com',
      pass: 'BrandTrace2026!',
      desc: 'Campaign-scoped read-only access to verify brand claim guidelines.',
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col justify-between text-slate-900 dark:text-slate-100 relative overflow-hidden">
      {/* Background ambient mesh */}
      <div className="mesh-blob w-96 h-96 bg-purple-500/20 dark:bg-purple-600/15 -top-10 -left-10" />
      <div className="mesh-blob w-96 h-96 bg-blue-500/15 dark:bg-blue-600/15 bottom-0 right-0" />

      {/* Top Bar with Back Link and Theme Toggle */}
      <header className="p-4 sm:p-6 flex items-center justify-between relative z-20">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 transition"
        >
          <span>← Back to Home</span>
        </button>
        <ThemeToggle />
      </header>

      {/* Split Screen Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 flex items-center justify-center relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full max-w-5xl items-center">
          {/* Left Panel: Desktop Brand Showcase */}
          <div className="hidden lg:flex lg:col-span-5 flex-col justify-center space-y-6 pr-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100/80 dark:bg-purple-950/70 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-800 w-fit">
              <SparklesIcon className="w-3.5 h-3.5 text-purple-600" />
              <span>Brand Governance Portal</span>
            </div>

            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-700 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-purple-600/25">
                <ShieldCheckIcon className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  BrandTrace
                </h1>
                <p className="text-xs font-mono text-purple-600 dark:text-purple-400">
                  Git for brand facts
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Sign in to manage truth graph facts, verify marketing collateral against approved sources, and calculate atomic blast radius impact.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                <CheckCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Deterministic token masking (zero sensitive numbers to LLM)</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                <CheckCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Append-only triggered PostgreSQL audit trail</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                <CheckCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Precedent-based living guidelines engine</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-200 dark:border-purple-800 text-xs text-purple-900 dark:text-purple-200 leading-snug">
              🔒 <strong>Authentication Protocol:</strong> Standard OAuth2-compatible JWT bearer tokens generated with HS256 cryptography.
            </div>
          </div>

          {/* Right Panel: Glass Authentication Card */}
          <div className="lg:col-span-7">
            <GlassCard intensity="prominent" className="p-6 sm:p-8">
              <div className="text-center sm:text-left mb-6">
                <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white">
                  Sign in to your account
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Access the live brand governance prototype
                </p>
              </div>

              {/* Error Banner */}
              {errorMsg && (
                <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-3 animate-in fade-in">
                  <ShieldAlertIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{errorMsg}</div>
                </div>
              )}

              {/* Credentials Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      autoFocus
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="name@brandtrace.internal"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-950/80 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400">
                      <UserIcon className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-950/80 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  size="md"
                  isLoading={isLoading}
                  rightIcon={<ArrowRightIcon className="w-4 h-4" />}
                  className="w-full mt-2"
                >
                  Sign In
                </Button>
              </form>

              {/* Seeded Demo Accounts Selector */}
              <div className="mt-8 pt-6 border-t border-slate-200/80 dark:border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setDemoAccountsOpen(!demoAccountsOpen)}
                  className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 hover:text-purple-600 transition"
                >
                  <div className="flex items-center gap-1.5">
                    <LockIcon className="w-3.5 h-3.5 text-purple-600" />
                    <span>Seeded Demo Accounts (1-Click Fill)</span>
                  </div>
                  <ChevronDownIcon className={`w-4 h-4 transition-transform duration-200 ${demoAccountsOpen ? 'rotate-180' : ''}`} />
                </button>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 italic">
                  Demo environment, illustrative data. Click any role to auto-populate credentials.
                </div>

                {demoAccountsOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    {demoAccounts.map(acc => {
                      const isSelected = email === acc.email;
                      return (
                        <div
                          key={acc.email}
                          onClick={() => selectDemoAccount(acc.email, acc.pass)}
                          className={`p-3 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                            isSelected
                              ? 'bg-purple-50/80 dark:bg-purple-950/60 border-purple-500 shadow-xs'
                              : 'bg-white/50 dark:bg-slate-950/50 border-slate-200/80 dark:border-slate-800/80 hover:border-purple-300 dark:hover:border-purple-800'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-xs text-slate-900 dark:text-white">
                              {acc.name}
                            </span>
                            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-semibold ${acc.badgeColor}`}>
                              {acc.role}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-purple-600 dark:text-purple-400 truncate">
                            {acc.email}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-tight">
                            {acc.desc}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </GlassCard>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-xs text-slate-400 dark:text-slate-500 relative z-10">
        BrandTrace · The LLM extracts, the backend verifies, humans decide.
      </footer>
    </div>
  );
};

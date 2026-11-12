import React, { useState, useEffect } from 'react';
import { useRouter } from '../router/Router';
import { api } from '../api/client';
import { ThemeToggle } from '../components/ThemeToggle';
import { GlassCard } from '../components/common/GlassCard';
import { Button } from '../components/common/Button';
import { SemanticBadge } from '../components/common/Badge';
import {
  ShieldCheckIcon,
  ShieldAlertIcon,
  AlertCircleIcon,
  SparklesIcon,
  GitCommitIcon,
  LayersIcon,
  HistoryIcon,
  FileTextIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  AlertTriangleIcon,
  RefreshIcon,
  LockIcon,
  SearchIcon,
  ExternalLinkIcon,
  CheckIcon,
} from '../components/Icons';

export const LandingPage: React.FC = () => {
  const { navigate } = useRouter();
  const [simulatedPrice, setSimulatedPrice] = useState<number>(4999);
  const isSimulated = simulatedPrice === 5499;

  // Demo mode configuration
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [demoLoading, setDemoLoading] = useState<boolean>(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  useEffect(() => {
    api.getPublicConfig().then(cfg => {
      setDemoMode(Boolean(cfg && cfg.demo_mode));
    }).catch(() => {
      setDemoMode(false);
    });
  }, []);

  const handleEnterDemo = async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      await api.demoLogin('admin');
      navigate('/app/findings');
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('Cannot reach backend') || msg.includes('timed out') || msg.includes('Failed to fetch')) {
        setDemoError('Cannot reach server, try again in a minute (free hosting may be waking up)');
      } else {
        setDemoError(msg || 'Demo sign-in failed. Please try again.');
      }
    } finally {
      setDemoLoading(false);
    }
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen text-slate-900 dark:text-slate-100 selection:bg-purple-500 selection:text-white">
      {/* ── STICKY GLASS NAVBAR ── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/75 dark:bg-slate-950/80 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-700 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-600/20">
              <ShieldCheckIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">
                  BrandTrace
                </span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-semibold border border-purple-200 dark:border-purple-800">
                  Gov 2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden sm:block">
                Git for brand facts
              </p>
            </div>
          </div>

          {/* Center Anchor Links */}
          <nav className="hidden md:flex items-center space-x-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <button onClick={() => scrollToSection('problem')} className="hover:text-purple-600 dark:hover:text-purple-400 transition">
              The Problem
            </button>
            <button onClick={() => scrollToSection('how-it-works')} className="hover:text-purple-600 dark:hover:text-purple-400 transition">
              How It Works
            </button>
            <button onClick={() => scrollToSection('features')} className="hover:text-purple-600 dark:hover:text-purple-400 transition">
              17 Features
            </button>
            <button onClick={() => scrollToSection('demo-scenario')} className="hover:text-purple-600 dark:hover:text-purple-400 transition">
              Interactive Demo
            </button>
            <button onClick={() => scrollToSection('evaluation')} className="hover:text-purple-600 dark:hover:text-purple-400 transition">
              Evaluation
            </button>
            <button onClick={() => scrollToSection('architecture')} className="hover:text-purple-600 dark:hover:text-purple-400 transition">
              Architecture
            </button>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center space-x-3">
            <ThemeToggle />
            {demoMode ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleEnterDemo}
                isLoading={demoLoading}
                rightIcon={<ArrowRightIcon className="w-3.5 h-3.5" />}
              >
                Enter demo as Admin
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate('/login')}
                rightIcon={<ArrowRightIcon className="w-3.5 h-3.5" />}
              >
                Sign In to Demo
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* ── SECTION 1: HERO ── */}
      <section className="relative overflow-hidden pt-12 pb-20 lg:pt-20 lg:pb-28">
        {/* Ambient Blur Glows */}
        <div className="mesh-blob w-96 h-96 bg-purple-500/20 dark:bg-purple-600/15 top-10 left-1/4" />
        <div className="mesh-blob w-80 h-80 bg-blue-500/20 dark:bg-blue-600/15 top-32 right-1/4" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Hero Text */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-purple-100/80 dark:bg-purple-950/70 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-800 backdrop-blur-md">
                <SparklesIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Deterministic Lineage · AI-Assisted Brand Governance</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.1]">
                BrandTrace: <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 dark:from-purple-400 dark:via-indigo-300 dark:to-blue-400">
                  Git for brand facts.
                </span>
              </h1>

              <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-2xl font-normal leading-relaxed">
                Every claim sourced. Every change traced. Every decision human.
              </p>

              {/* Principle Strip */}
              <div className="p-3.5 rounded-xl bg-slate-100/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex items-center justify-center lg:justify-start gap-3 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
                <span className="text-purple-600 dark:text-purple-400">LLM extracts</span>
                <span className="text-slate-400">·</span>
                <span className="text-indigo-600 dark:text-indigo-400">Backend verifies</span>
                <span className="text-slate-400">·</span>
                <span className="text-emerald-600 dark:text-emerald-400">Humans decide</span>
              </div>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                {demoMode ? (
                  <Button
                    size="lg"
                    onClick={handleEnterDemo}
                    isLoading={demoLoading}
                    rightIcon={<ArrowRightIcon className="w-4 h-4" />}
                    className="w-full sm:w-auto text-base font-bold shadow-lg shadow-purple-600/25"
                  >
                    Enter demo as Admin
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    onClick={() => navigate('/login')}
                    rightIcon={<ArrowRightIcon className="w-4 h-4" />}
                    className="w-full sm:w-auto text-base font-bold"
                  >
                    Sign in to the demo
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => scrollToSection('how-it-works')}
                  className="w-full sm:w-auto text-base"
                >
                  See how it works
                </Button>
              </div>

              {demoError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-300 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 animate-in fade-in">
                  {demoError}
                </div>
              )}

              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center lg:justify-start gap-2 pt-2">
                <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                <span>Zero fabricated claims · Tested against 52 test suites · IST Timestamps</span>
              </div>
            </div>

            {/* Right Hero Visual Card: Live F001 Change Impact Mock */}
            <div className="lg:col-span-5">
              <GlassCard intensity="prominent" className="p-6 relative overflow-hidden">
                <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-lg bg-purple-600/10 text-purple-600 dark:text-purple-400">
                      <GitCommitIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-purple-600 dark:text-purple-400">
                        FACT F001 · V1 ➔ V2
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        Standard Tier Pricing Change
                      </div>
                    </div>
                  </div>
                  <SemanticBadge value="Critical" />
                </div>

                {/* Change Details */}
                <div className="mt-4 space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/60 dark:border-slate-800/60">
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Value Transition
                    </div>
                    <div className="flex items-center gap-3 mt-1 font-mono text-base font-bold">
                      <span className="line-through text-slate-400">₹4,999</span>
                      <ArrowRightIcon className="w-4 h-4 text-purple-600" />
                      <span className="text-purple-600 dark:text-purple-400">₹5,499</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Effective: <strong>1 Dec 2026, 00:00 IST</strong> · Owner: Elena Vance (Admin)
                    </div>
                  </div>

                  {/* Blast Radius Stats */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60">
                      <div className="text-amber-800 dark:text-amber-300 font-bold">2 Re-Review Required</div>
                      <div className="text-[10px] text-amber-700/80 dark:text-amber-400">LinkedIn Post & Email</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/60">
                      <div className="text-purple-800 dark:text-purple-300 font-bold">1 Marked Stale</div>
                      <div className="text-[10px] text-purple-700/80 dark:text-purple-400">Instagram Carousel</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60">
                      <div className="text-rose-800 dark:text-rose-300 font-bold">1 RED ALERT</div>
                      <div className="text-[10px] text-rose-700/80 dark:text-rose-400">Product Brochure PDF</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                      <div className="text-slate-800 dark:text-slate-200 font-bold">1 Left Alone</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Webinar Recap</div>
                    </div>
                  </div>

                  {/* Impact Alert Footnote */}
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-300/40 dark:border-purple-800/40 text-xs text-purple-900 dark:text-purple-200 leading-snug">
                    ⚡ <strong>Automated Blast Radius Cascade:</strong> All approvals revoked upon commit. Reviewers notified via audit trail.
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: THE PROBLEM & PRECEDENTS ── */}
      <section id="problem" className="py-20 bg-slate-100/50 dark:bg-slate-900/30 border-y border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <SemanticBadge value="Critical" />
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              The Governance Bottleneck
            </h2>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300">
              Generative AI multiplies marketing output by 10x, but legal and human review capacity remains fixed.
              Three structural hazards threaten modern brands:
            </p>
          </div>

          {/* 3 Core Hazards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <GlassCard className="p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold">
                <AlertTriangleIcon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">1. Stale Facts</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Pricing, warranty timelines, and product specifications change in the database, while old collateral continues circulating in paid ads and partner channels.
              </p>
            </GlassCard>

            <GlassCard className="p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
                <ShieldAlertIcon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">2. Unsupported Claims</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Copywriters and AI agents author compelling superlatives (&quot;100% organic&quot;, &quot;2x faster&quot;) without pointing to a verifiable, versioned source fact.
              </p>
            </GlassCard>

            <GlassCard className="p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                <LayersIcon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">3. Cross-Channel Collisions</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Email promises 20% off while Instagram advertises 25% for the same launch, resulting in customer mistrust, chargebacks, and regulatory inquiry.
              </p>
            </GlassCard>
          </div>

          {/* Documented Legal Precedents (Real Cases Only) */}
          <div className="mt-12 p-6 rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <HistoryIcon className="w-5 h-5 text-purple-600" />
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                Public Legal Precedents &amp; Regulatory Enforcement
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                <div className="font-bold text-slate-900 dark:text-white mb-1">
                  Moffatt v. Air Canada (2024)
                </div>
                <div className="text-slate-500 dark:text-slate-400 mb-2 font-mono">Civil Resolution Tribunal</div>
                <p>
                  Tribunal ruled that a corporation is strictly liable for hallucinated policy and bereavement discount claims made by its automated chat agent.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                <div className="font-bold text-slate-900 dark:text-white mb-1">
                  CCPA v. FirstCry (Sep 2025)
                </div>
                <div className="text-slate-500 dark:text-slate-400 mb-2 font-mono">Central Consumer Protection Authority</div>
                <p>
                  Regulatory notice penalising inconsistent discount claims and price display discrepancies across web, mobile application, and email marketing.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                <div className="font-bold text-slate-900 dark:text-white mb-1">
                  ASCI Annual Report (2023–24)
                </div>
                <div className="text-slate-500 dark:text-slate-400 mb-2 font-mono">Advertising Standards Council of India</div>
                <p>
                  Over 8,200 consumer complaints evaluated; 79% of non-compliant advertisements required modifications due to unsubstantiated direct claims.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: HOW IT WORKS (8-STAGE STEPPER) ── */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <SemanticBadge value="Info" />
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              How BrandTrace Works
            </h2>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300">
              An 8-stage deterministic pipeline where machines do what they do best (extract, compare, flag), and humans retain sole publishing authority.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-14">
            {[
              {
                step: '01',
                title: 'Content Upload',
                desc: 'Upload marketing collateral in PDF, Markdown, or raw copy with campaign tags.',
                icon: FileTextIcon,
              },
              {
                step: '02',
                title: 'Deterministic Token Masking',
                desc: 'Regex replaces numbers and currencies with tokens ([PRICE_1], [DATE_1]) before AI processing.',
                icon: LockIcon,
              },
              {
                step: '03',
                title: 'LLM Semantic Typing',
                desc: 'Groq LLaMA 3.3 identifies claim entities without seeing raw numbers, avoiding hallucinations.',
                icon: SparklesIcon,
              },
              {
                step: '04',
                title: 'Backend Verification Cascade',
                desc: 'Deterministic exact matching, followed by PostgreSQL pg_trgm fuzzy similarity lookup.',
                icon: SearchIcon,
              },
              {
                step: '05',
                title: 'Findings & 3 Fix Options',
                desc: 'Displays risk tier, evidence snippet, and 3 actions: Accept Fact, Override, or Request Review.',
                icon: AlertTriangleIcon,
              },
              {
                step: '06',
                title: 'Reviewer Stage',
                desc: 'Reviewers compare claims against living guidelines and previous approval precedents.',
                icon: HistoryIcon,
              },
              {
                step: '07',
                title: 'Admin Sign-Off',
                desc: 'Role-based permission gating requires formal approval before status changes to Live.',
                icon: ShieldCheckIcon,
              },
              {
                step: '08',
                title: 'Lineage Pinned & Monitored',
                desc: 'Collateral is pinned to immutable fact versions. A changed fact re-opens affected content.',
                icon: GitCommitIcon,
              },
            ].map(item => {
              const Icon = item.icon;
              return (
                <GlassCard key={item.step} hoverEffect className="p-6 relative">
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-2xl font-black text-purple-600/40 dark:text-purple-400/40">
                      {item.step}
                    </span>
                    <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                      <Icon className="w-5 h-5" />
                    </div>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {item.desc}
                  </p>
                </GlassCard>
              );
            })}
          </div>

          <div className="mt-8 p-4 rounded-xl bg-purple-100/60 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-center text-xs font-semibold text-purple-900 dark:text-purple-200">
            🔁 <strong>Continuous Re-Evaluation:</strong> Whenever a fact version is modified or retired in the Truth Graph, BrandTrace automatically recalculates the blast radius and shifts affected pieces into <code>re-review required</code>.
          </div>
        </div>
      </section>

      {/* ── SECTION 4: 17 FEATURES GRID ── */}
      <section id="features" className="py-20 bg-slate-100/50 dark:bg-slate-900/30 border-y border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
              <CheckCircleIcon className="w-3.5 h-3.5" />
              <span>Full Governance Capability</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              17 Enterprise Governance Features
            </h2>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300">
              Built specifically for marketing ops, regulatory compliance, and brand integrity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
            {[
              {
                title: 'Truth Graph',
                desc: 'Versioned approved facts with source file, page number, owner, effective date, and expiry date in IST.',
                role: 'Admin',
                icon: GitCommitIcon,
              },
              {
                title: 'Claim Lineage',
                desc: 'Every marketing claim is pinned to an immutable fact version (e.g. F001 v1) for complete retrospective audit.',
                role: 'Creator & Reviewer',
                icon: LayersIcon,
              },
              {
                title: 'Deterministic Normalisation',
                desc: 'Handles currency and numeric variants (₹4,999 = Rs 4999/- = 4,999 rupees; lakh/crore; dates in IST; "4.9k" flagged approximate).',
                role: 'Engine',
                icon: CheckCircleIcon,
              },
              {
                title: 'Token Masking',
                desc: 'Numeric values never reach the LLM. Replaced with [PRICE_1] and [DATE_1] placeholders to prevent hallucinated numbers.',
                role: 'Engine & Privacy',
                icon: LockIcon,
              },
              {
                title: 'Matching Cascade',
                desc: '3-tier matching engine: Tier 1 Exact Normalized, Tier 2 pg_trgm Trigram Fuzzy, Tier 3 Human Review Queue.',
                role: 'Engine',
                icon: SearchIcon,
              },
              {
                title: 'Four Claim States',
                desc: 'Verified (matches active fact), Contradicted (differs from active fact), Unverified (never declared false), and Stale.',
                role: 'Reviewer',
                icon: AlertTriangleIcon,
              },
              {
                title: 'Discrete Risk Tiers',
                desc: 'Critical, High, Medium, Info with clear explainability reasons. Zero opaque composite scores.',
                role: 'Reviewer & Admin',
                icon: ShieldAlertIcon,
              },
              {
                title: 'Confidence vs Status Separation',
                desc: 'Extraction confidence (how sure the parser is) is shown separately from verification status (whether it is true).',
                role: 'Reviewer',
                icon: CheckIcon,
              },
              {
                title: 'Evidence Preview',
                desc: 'Side-by-side preview with source document file name, page number, and surrounding paragraph snippet.',
                role: 'Creator & Reviewer',
                icon: FileTextIcon,
              },
              {
                title: 'Smart Correction Assistant',
                desc: 'Three instant fix options: Option A align to source, Option B update truth fact, Option C log approved exception.',
                role: 'Creator & Reviewer',
                icon: SparklesIcon,
              },
              {
                title: 'Change-Impact Blast Radius',
                desc: 'Simulate or execute a fact change to see every piece of live collateral affected across all channels before commit.',
                role: 'Admin & Reviewer',
                icon: RefreshIcon,
              },
              {
                title: 'Campaign Coherence Lite',
                desc: 'Detects cross-channel collisions (e.g., email discount says 20% while Instagram creative says 25%).',
                role: 'Marketing & Reviewer',
                icon: LayersIcon,
              },
              {
                title: 'Living Guidelines Precedents',
                desc: 'Historical reviewer exceptions and override rationale (e.g. promotional rounding rules) reused to avoid rework.',
                role: 'Legal & Reviewer',
                icon: HistoryIcon,
              },
              {
                title: '4-Role Permission Matrix',
                desc: 'Strict role-based action guards: Admin (full), Creator (draft & verify), Reviewer (approvals), Agency (scoped read-only).',
                role: 'Security',
                icon: LockIcon,
              },
              {
                title: 'Append-Only Triggered Audit Trail',
                desc: 'Database-level PostgreSQL triggers log every change with actor ID, timestamp, prior state, and cryptographic integrity.',
                role: 'Compliance',
                icon: ShieldCheckIcon,
              },
              {
                title: 'In-App Notification Dispatch',
                desc: 'Real-time alert dispatch to affected creators and reviewers whenever a dependent fact is modified or retired.',
                role: 'All Roles',
                icon: RefreshIcon,
              },
              {
                title: 'Human Approval Gating',
                desc: 'AI cannot auto-publish content. Approval requires an explicit human reviewer or admin digital sign-off.',
                role: 'Governance',
                icon: ShieldCheckIcon,
              },
            ].map(f => {
              const Icon = f.icon;
              return (
                <GlassCard key={f.title} hoverEffect className="p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {f.role}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                      {f.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {f.desc}
                    </p>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: INTERACTIVE DEMO SCENARIO ── */}
      <section id="demo-scenario" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <SemanticBadge value="Medium" />
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Interactive Demo: One Fact Changes, Five Pieces Respond
            </h2>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300">
              Experience the atomic cascade engine. Click below to simulate updating Fact F001 price from ₹4,999 to ₹5,499.
            </p>
            <div className="text-xs text-slate-500 dark:text-slate-400 italic">
              Illustrative demo data from the BrandTrace Evaluation Pack
            </div>
          </div>

          {/* Interactive Simulation Controller */}
          <div className="mt-8 flex justify-center items-center gap-4">
            <Button
              variant={!isSimulated ? 'secondary' : 'outline'}
              size="md"
              onClick={() => setSimulatedPrice(4999)}
            >
              Base State: ₹4,999 (v1)
            </Button>
            <Button
              variant={isSimulated ? 'primary' : 'outline'}
              size="md"
              onClick={() => setSimulatedPrice(5499)}
              rightIcon={<RefreshIcon className="w-4 h-4" />}
            >
              Simulate Price Increase: ₹5,499 (v2)
            </Button>
          </div>

          {/* Collateral Pieces Table */}
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 uppercase font-mono tracking-wider">
                    <th className="py-3 px-4">Collateral Piece</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">Cited Claim Value</th>
                    <th className="py-3 px-4">Claim Status</th>
                    <th className="py-3 px-4">Approval State</th>
                    <th className="py-3 px-4">Engine Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 font-sans">
                  {/* Row 1: LinkedIn Post */}
                  <tr className={isSimulated ? 'bg-amber-500/10 transition-colors' : ''}>
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                      Festive Launch Post
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">LinkedIn</td>
                    <td className="py-3.5 px-4 font-mono font-bold">₹4,999</td>
                    <td className="py-3.5 px-4">
                      <SemanticBadge value={isSimulated ? 'Contradicted' : 'Verified'} />
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`font-semibold ${isSimulated ? 'text-amber-600 dark:text-amber-400 animate-pulse' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {isSimulated ? 're-review required' : 'approved'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {isSimulated ? 'Approval revoked; author notified' : 'Matches v1'}
                    </td>
                  </tr>

                  {/* Row 2: Festive Email */}
                  <tr className={isSimulated ? 'bg-amber-500/10 transition-colors' : ''}>
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                      Early Bird Email Newsletter
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">Email</td>
                    <td className="py-3.5 px-4 font-mono font-bold">₹4,999</td>
                    <td className="py-3.5 px-4">
                      <SemanticBadge value={isSimulated ? 'Contradicted' : 'Verified'} />
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`font-semibold ${isSimulated ? 'text-amber-600 dark:text-amber-400 animate-pulse' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {isSimulated ? 're-review required' : 'approved'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {isSimulated ? 'Campaign locked from dispatch' : 'Matches v1'}
                    </td>
                  </tr>

                  {/* Row 3: Instagram Caption */}
                  <tr className={isSimulated ? 'bg-purple-500/10 transition-colors' : ''}>
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                      Teaser Carousel
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">Instagram</td>
                    <td className="py-3.5 px-4 font-mono font-bold">₹4,999</td>
                    <td className="py-3.5 px-4">
                      <SemanticBadge value={isSimulated ? 'Stale' : 'Verified'} />
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`font-semibold ${isSimulated ? 'text-purple-600 dark:text-purple-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {isSimulated ? 'stale' : 'approved'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {isSimulated ? 'Marked stale; creative update suggested' : 'Matches v1'}
                    </td>
                  </tr>

                  {/* Row 4: Product Brochure PDF */}
                  <tr className={isSimulated ? 'bg-rose-500/15 transition-colors' : ''}>
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                      Enterprise Brochure PDF
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">PDF / Print</td>
                    <td className="py-3.5 px-4 font-mono font-bold">₹4,999 (Tier A)</td>
                    <td className="py-3.5 px-4">
                      <SemanticBadge value={isSimulated ? 'Contradicted' : 'Verified'} />
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`font-bold uppercase ${isSimulated ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {isSimulated ? 'RED ALERT: blocked' : 'approved'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      {isSimulated ? '🚨 High print cost risk: download blocked' : 'Matches v1'}
                    </td>
                  </tr>

                  {/* Row 5: Webinar Recap */}
                  <tr className="bg-slate-50/40 dark:bg-slate-950/30">
                    <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                      Customer Webinar Deck
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">Slides</td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">— (Features Only)</td>
                    <td className="py-3.5 px-4">
                      <span className="text-slate-500">Unlinked</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-slate-500 font-medium">live</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      Left alone (No pricing claims detected)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 6: SYSTEM ARCHITECTURE (INLINE SVG) ── */}
      <section id="architecture" className="py-20 bg-slate-100/50 dark:bg-slate-900/30 border-y border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <SemanticBadge value="Info" />
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              System Architecture &amp; Privacy Pipeline
            </h2>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300">
              Clean separation of concerns: token masking isolates sensitive numeric data from LLMs, while PostgreSQL triggers enforce append-only audit immutability.
            </p>
          </div>

          {/* Inline SVG Architecture Diagram */}
          <div className="mt-12 p-6 rounded-2xl bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 shadow-md overflow-x-auto">
            <svg
              className="w-full min-w-[700px] h-auto"
              viewBox="0 0 900 420"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Layer 1: Client UI */}
              <rect x="20" y="20" width="240" height="380" rx="16" fill="rgba(124, 58, 237, 0.06)" stroke="#7c3aed" strokeWidth="1.5" strokeDasharray="4 4" />
              <text x="40" y="50" fill="#7c3aed" fontWeight="bold" fontSize="14" fontFamily="sans-serif">PRESENTATION LAYER</text>
              <rect x="40" y="70" width="200" height="60" rx="8" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
              <text x="55" y="95" fill="#0f172a" fontWeight="bold" fontSize="12" fontFamily="sans-serif">React 19 + Tailwind</text>
              <text x="55" y="115" fill="#64748b" fontSize="10" fontFamily="sans-serif">Glassmorphism / Theme Engine</text>

              <rect x="40" y="150" width="200" height="60" rx="8" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
              <text x="55" y="175" fill="#0f172a" fontWeight="bold" fontSize="12" fontFamily="sans-serif">6 Governance Views</text>
              <text x="55" y="195" fill="#64748b" fontSize="10" fontFamily="sans-serif">Findings, Impact, Graph, Audit</text>

              <rect x="40" y="230" width="200" height="60" rx="8" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
              <text x="55" y="255" fill="#0f172a" fontWeight="bold" fontSize="12" fontFamily="sans-serif">Client Router</text>
              <text x="55" y="275" fill="#64748b" fontSize="10" fontFamily="sans-serif">History API / Route Guards</text>

              <rect x="40" y="310" width="200" height="60" rx="8" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
              <text x="55" y="335" fill="#0f172a" fontWeight="bold" fontSize="12" fontFamily="sans-serif">JWT Auth Client</text>
              <text x="55" y="355" fill="#64748b" fontSize="10" fontFamily="sans-serif">Bearer Token / 401 Interceptor</text>

              {/* Arrow 1 */}
              <path d="M260 210 H320" stroke="#7c3aed" strokeWidth="2" markerEnd="url(#arrow)" />

              {/* Layer 2: API Gateway */}
              <rect x="330" y="20" width="240" height="380" rx="16" fill="rgba(59, 130, 246, 0.06)" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4 4" />
              <text x="350" y="50" fill="#3b82f6" fontWeight="bold" fontSize="14" fontFamily="sans-serif">FASTAPI GATEWAY</text>

              <rect x="350" y="70" width="200" height="60" rx="8" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
              <text x="365" y="95" fill="#0f172a" fontWeight="bold" fontSize="12" fontFamily="sans-serif">JWT &amp; RBAC Middleware</text>
              <text x="365" y="115" fill="#64748b" fontSize="10" fontFamily="sans-serif">4 Roles: Admin, Creator, Reviewer</text>

              <rect x="350" y="150" width="200" height="70" rx="8" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
              <text x="365" y="175" fill="#0f172a" fontWeight="bold" fontSize="12" fontFamily="sans-serif">Privacy Token Masker</text>
              <text x="365" y="195" fill="#7c3aed" fontSize="10" fontFamily="monospace">Raw: ₹4,999 ➔ [PRICE_1]</text>
              <text x="365" y="210" fill="#64748b" fontSize="10" fontFamily="sans-serif">Zero sensitive numbers to LLM</text>

              <rect x="350" y="240" width="200" height="65" rx="8" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
              <text x="365" y="265" fill="#0f172a" fontWeight="bold" fontSize="12" fontFamily="sans-serif">Groq LLaMA 3.3</text>
              <text x="365" y="285" fill="#64748b" fontSize="10" fontFamily="sans-serif">Semantic entity identification</text>

              <rect x="350" y="325" width="200" height="60" rx="8" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
              <text x="365" y="348" fill="#0f172a" fontWeight="bold" fontSize="12" fontFamily="sans-serif">Deterministic Normaliser</text>
              <text x="365" y="368" fill="#64748b" fontSize="10" fontFamily="sans-serif">IST Time / INR / Lakh / Crore</text>

              {/* Arrow 2 */}
              <path d="M570 210 H630" stroke="#3b82f6" strokeWidth="2" markerEnd="url(#arrow)" />

              {/* Layer 3: Database & Verification Engine */}
              <rect x="640" y="20" width="240" height="380" rx="16" fill="rgba(16, 185, 129, 0.06)" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4 4" />
              <text x="660" y="50" fill="#10b981" fontWeight="bold" fontSize="14" fontFamily="sans-serif">STORAGE &amp; VERIFICATION</text>

              <rect x="660" y="70" width="200" height="70" rx="8" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
              <text x="675" y="95" fill="#0f172a" fontWeight="bold" fontSize="12" fontFamily="sans-serif">Matching Cascade</text>
              <text x="675" y="115" fill="#64748b" fontSize="10" fontFamily="sans-serif">1. Exact Normalized</text>
              <text x="675" y="130" fill="#64748b" fontSize="10" fontFamily="sans-serif">2. pg_trgm Trigram Fuzzy</text>

              <rect x="660" y="160" width="200" height="60" rx="8" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
              <text x="675" y="185" fill="#0f172a" fontWeight="bold" fontSize="12" fontFamily="sans-serif">Truth Graph Tables</text>
              <text x="675" y="205" fill="#64748b" fontSize="10" fontFamily="sans-serif">18 Normalized Relational Tables</text>

              <rect x="660" y="240" width="200" height="65" rx="8" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
              <text x="675" y="265" fill="#0f172a" fontWeight="bold" fontSize="12" fontFamily="sans-serif">Append-Only Audit Log</text>
              <text x="675" y="285" fill="#64748b" fontSize="10" fontFamily="sans-serif">PostgreSQL Trigger Enforcement</text>

              <rect x="660" y="325" width="200" height="60" rx="8" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
              <text x="675" y="348" fill="#0f172a" fontWeight="bold" fontSize="12" fontFamily="sans-serif">Blast Radius Engine</text>
              <text x="675" y="368" fill="#64748b" fontSize="10" fontFamily="sans-serif">Atomic Cascade Invalidation</text>

              {/* Marker def */}
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
                </marker>
              </defs>
            </svg>
          </div>
        </div>
      </section>

      {/* ── SECTION 7: TECH STACK ── */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h3 className="text-xs font-mono uppercase tracking-wider text-purple-600 dark:text-purple-400 font-bold">
              Engineering Stack
            </h3>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              Production-Proven, Modern Infrastructure
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 text-center">
            {[
              { name: 'React 19', tag: 'UI Library' },
              { name: 'Vite', tag: 'Bundler' },
              { name: 'Tailwind CSS', tag: 'Styling' },
              { name: 'FastAPI', tag: 'API Engine' },
              { name: 'PostgreSQL 16', tag: 'pg_trgm DB' },
              { name: 'Groq LLaMA 3.3', tag: 'LLM Parser' },
              { name: 'PyMuPDF', tag: 'Document Reader' },
              { name: 'Render', tag: 'Cloud Host' },
            ].map(t => (
              <div
                key={t.name}
                className="p-4 rounded-xl bg-white/60 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60 backdrop-blur-md"
              >
                <div className="font-bold text-sm text-slate-900 dark:text-white">{t.name}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono">{t.tag}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 8: RESPONSIBLE AI PRINCIPLES ── */}
      <section className="py-16 bg-slate-100/50 dark:bg-slate-900/30 border-y border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 mb-3">
                <ShieldCheckIcon className="w-3.5 h-3.5" />
                <span>Ethical &amp; Responsible AI Architecture</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                Human-in-the-Loop by Design
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-3 leading-relaxed">
                BrandTrace does not generate creative copy or make autonomous decisions. The system operates strictly as an investigative assistant that surfaces truth graph contradictions, calculates blast radius, and insists on explicit human sign-off.
              </p>

              <div className="mt-4 space-y-2 text-xs text-slate-700 dark:text-slate-300">
                <div className="flex items-start gap-2">
                  <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Deterministic explainability:</strong> Every finding links to an exact character span and source page.</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Zero number leakage:</strong> Currency amounts and dates are masked before transmission.</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span><strong>Unverified ≠ False:</strong> Claims lacking facts are labelled <em>Unverified</em> rather than falsely refuted.</span>
                </div>
              </div>
            </div>

            {/* Compliance Disclaimer Box */}
            <div className="p-6 rounded-2xl bg-white/80 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold text-sm">
                <AlertCircleIcon className="w-5 h-5" />
                <span>Regulatory Notice &amp; Disclaimer</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                BrandTrace provides automated internal verification and decision-support tools for marketing, legal, and brand operations teams. <strong>BrandTrace supports governance workflows but does not certify legal compliance or provide formal legal opinions.</strong> Final publishing decisions and regulatory liabilities remain solely with human stakeholders.
              </p>
              <div className="text-[11px] font-mono text-slate-500 pt-1">
                Evaluation Benchmark: Real Evaluation Pack · Custom JWT Authentication
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 9: EMPIRICAL EVALUATION & REAL METRICS ── */}
      <section id="evaluation" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <SemanticBadge value="Verified" />
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Empirical Evaluation &amp; Benchmark Metrics
            </h2>
            <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300">
              Verified performance figures from the 30-item BrandTrace test corpus.
            </p>
            <div className="text-xs font-mono text-purple-600 dark:text-purple-400 font-semibold">
              Source: README.md evaluation pack · small sample, indicative
            </div>
          </div>

          {/* Benchmark KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
            <GlassCard className="p-6 text-center">
              <div className="text-4xl font-black text-purple-600 dark:text-purple-400 font-mono">
                83.3%
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">Overall Accuracy</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                95% Wilson Interval: [66.4%, 92.7%]
              </div>
            </GlassCard>

            <GlassCard className="p-6 text-center">
              <div className="text-4xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                90.6%
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">Extraction Precision</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                Deterministic regex + masked LLaMA
              </div>
            </GlassCard>

            <GlassCard className="p-6 text-center">
              <div className="text-4xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                96.7%
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">Extraction Recall</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                High recall on pricing &amp; percentages
              </div>
            </GlassCard>

            <GlassCard className="p-6 text-center">
              <div className="text-4xl font-black text-blue-600 dark:text-blue-400 font-mono">
                52 / 52
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">Automated Tests</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                100% pytest suite pass rate
              </div>
            </GlassCard>
          </div>

          {/* 4x4 Confusion Matrix */}
          <div className="mt-12 p-6 rounded-2xl bg-white/80 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
              Claim State 4x4 Confusion Matrix (30 Evaluation Items)
            </h4>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-xs text-center border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-mono">
                    <th className="py-2 px-3 text-left">Ground Truth \ Predicted</th>
                    <th className="py-2 px-3 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Verified</th>
                    <th className="py-2 px-3 bg-rose-500/10 text-rose-700 dark:text-rose-300">Contradicted</th>
                    <th className="py-2 px-3 bg-amber-500/10 text-amber-700 dark:text-amber-300">Unverified</th>
                    <th className="py-2 px-3 bg-purple-500/10 text-purple-700 dark:text-purple-300">Stale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono">
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-left text-slate-900 dark:text-white">Verified (11)</td>
                    <td className="py-2.5 px-3 font-bold text-emerald-600">10</td>
                    <td className="py-2.5 px-3 text-slate-400">0</td>
                    <td className="py-2.5 px-3 text-amber-600">1</td>
                    <td className="py-2.5 px-3 text-slate-400">0</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-left text-slate-900 dark:text-white">Contradicted (9)</td>
                    <td className="py-2.5 px-3 text-slate-400">0</td>
                    <td className="py-2.5 px-3 font-bold text-rose-600">8</td>
                    <td className="py-2.5 px-3 text-amber-600">1</td>
                    <td className="py-2.5 px-3 text-slate-400">0</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-left text-slate-900 dark:text-white">Unverified (6)</td>
                    <td className="py-2.5 px-3 text-slate-400">0</td>
                    <td className="py-2.5 px-3 text-slate-400">0</td>
                    <td className="py-2.5 px-3 font-bold text-amber-600">5</td>
                    <td className="py-2.5 px-3 text-purple-600">1</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-left text-slate-900 dark:text-white">Stale (4)</td>
                    <td className="py-2.5 px-3 text-slate-400">0</td>
                    <td className="py-2.5 px-3 text-rose-600">1</td>
                    <td className="py-2.5 px-3 text-slate-400">0</td>
                    <td className="py-2.5 px-3 font-bold text-purple-600">3</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 10: ROADMAP ── */}
      <section className="py-20 bg-slate-100/50 dark:bg-slate-900/30 border-y border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <SemanticBadge value="Info" />
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-2">
              Development Roadmap
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GlassCard className="p-6 space-y-3 border-purple-400/50 dark:border-purple-800">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                <span>Currently Built (Verified)</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Core Governance Engine</h3>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc list-inside">
                <li>Pre-tokenized claim verification &amp; fix options</li>
                <li>Truth Graph (valid_from / valid_to) &amp; What-If preview</li>
                <li>Atomic Change-Impact cascade &amp; CSV export</li>
                <li>Numeric Campaign Coherence &amp; Precedents ledger</li>
                <li>Trigger-enforced audit trail &amp; 4-role RBAC</li>
              </ul>
            </GlassCard>

            <GlassCard className="p-6 space-y-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                <span>Round 3 Target</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">PDF Evidence, Rule Synthesis &amp; Drift</h3>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc list-inside">
                <li>PyMuPDF deep-linked PDF evidence highlights</li>
                <li>Precedent-to-rule synthesizer &amp; approval workflow</li>
                <li>Semantic cross-channel conflicts &amp; expiry forecasting</li>
                <li>Per-role home dashboard &amp; deterministic fallback</li>
              </ul>
            </GlassCard>

            <GlassCard className="p-6 space-y-3">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <span>Future Horizon</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Ecosystem Integration</h3>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc list-inside">
                <li>Image, poster &amp; slide deck OCR ingestion</li>
                <li>Google Docs &amp; Slack real-time sidecars</li>
                <li>Policy-approved auto-remediation triggers</li>
                <li>Multilingual regional normalization</li>
              </ul>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* ── SECTION 11: TEAM & EVENT ── */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="text-xs font-mono uppercase text-purple-600 dark:text-purple-400 font-bold mb-1">
            Built with rigor
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            The BrandTrace Engineering Team
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-8">
            Inkloom AI Brand Governance Challenge (Round 3)
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <GlassCard className="p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center mx-auto mb-2 text-base">
                HP
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">Hari Priya C</div>
              <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">Team Lead &amp; Architecture</div>
            </GlassCard>

            <GlassCard className="p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center mx-auto mb-2 text-base">
                JN
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">Jeevitha N</div>
              <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Core Full-Stack Engineer</div>
            </GlassCard>

            <GlassCard className="p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center mx-auto mb-2 text-base">
                SN
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">Sheerinbanu N</div>
              <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Pipeline &amp; NLP Engineer</div>
            </GlassCard>

            <GlassCard className="p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center mx-auto mb-2 text-base">
                JJ
              </div>
              <div className="font-bold text-sm text-slate-900 dark:text-white">Jayasree J</div>
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Quality &amp; Evaluation Engineer</div>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* ── SECTION 12: CONVERSION CTA & FOOTER ── */}
      <section className="py-20 bg-gradient-to-b from-transparent via-purple-500/5 to-purple-600/10 dark:from-transparent dark:via-purple-950/20 dark:to-purple-950/40 border-t border-slate-200/60 dark:border-slate-800/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-purple-600 text-white flex items-center justify-center mx-auto shadow-xl shadow-purple-600/30">
            <ShieldCheckIcon className="w-7 h-7" />
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white">
            Experience Human-in-the-Loop Brand Governance
          </h2>
          <p className="text-base text-slate-600 dark:text-slate-300 max-w-xl mx-auto leading-relaxed">
            Test the live prototype now with seeded demo accounts for Admin, Creator, Reviewer, and Agency personas.
          </p>
          <div className="pt-2">
            <Button
              size="lg"
              onClick={() => navigate('/login')}
              rightIcon={<ArrowRightIcon className="w-5 h-5" />}
              className="text-base px-8 py-3.5"
            >
              Sign in to the demo
            </Button>
          </div>
          <div className="flex items-center justify-center gap-6 pt-4 text-xs font-mono text-slate-500">
            <a
              href="https://brandtrace.onrender.com/docs"
              target="_blank"
              rel="noreferrer"
              className="hover:text-purple-600 flex items-center gap-1 transition"
            >
              <span>Swagger API Docs</span>
              <ExternalLinkIcon className="w-3.5 h-3.5" />
            </a>
            <span>·</span>
            <span>FastAPI + PostgreSQL + Vite</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-950/80 backdrop-blur-md py-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <strong>BrandTrace</strong> · Inkloom AI Brand Governance Challenge (Round 3)
          </div>
          <div className="text-center sm:text-right font-medium text-purple-700 dark:text-purple-400">
            Principle: The LLM extracts · The backend verifies · Humans decide.
          </div>
        </div>
      </footer>
    </div>
  );
};

import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
  intensity?: 'subtle' | 'normal' | 'prominent';
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  hoverEffect = false,
  intensity = 'normal',
  ...props
}) => {
  const intensityClasses = {
    subtle: 'bg-white/50 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/50',
    normal: 'bg-white/70 dark:bg-slate-900/60 border-white/60 dark:border-slate-800/80 shadow-lg shadow-purple-500/5 dark:shadow-black/30',
    prominent: 'bg-white/85 dark:bg-slate-900/80 border-purple-200/50 dark:border-purple-900/40 shadow-xl shadow-purple-600/10 dark:shadow-purple-950/40',
  };

  const hoverClasses = hoverEffect
    ? 'transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:border-purple-300/70 dark:hover:border-purple-700/60'
    : '';

  return (
    <div
      className={`backdrop-blur-xl saturate-150 rounded-2xl border ${intensityClasses[intensity]} ${hoverClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

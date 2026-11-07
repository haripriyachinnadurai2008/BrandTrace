import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { SunIcon, MoonIcon } from './Icons';

interface ThemeToggleProps {
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 rounded-xl transition-all duration-200 border text-slate-700 dark:text-slate-200 hover:text-purple-600 dark:hover:text-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 ${
        theme === 'dark'
          ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-700/80'
          : 'bg-white/80 border-slate-200/80 hover:bg-slate-100/90 shadow-xs'
      } ${className}`}
    >
      {theme === 'dark' ? (
        <SunIcon className="w-5 h-5 text-amber-400 animate-in fade-in duration-200" />
      ) : (
        <MoonIcon className="w-5 h-5 text-purple-600 animate-in fade-in duration-200" />
      )}
    </button>
  );
};

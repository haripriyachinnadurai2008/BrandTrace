import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs rounded-lg min-h-[36px]',
    md: 'px-4 py-2.5 text-sm rounded-xl min-h-[44px]',
    lg: 'px-6 py-3 text-base rounded-2xl min-h-[48px] font-semibold',
  };

  const variantClasses = {
    primary:
      'bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white shadow-md shadow-purple-600/20 border border-purple-500/40 focus:ring-2 focus:ring-purple-500/50',
    secondary:
      'bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white dark:bg-slate-700 dark:hover:bg-slate-600 border border-slate-700/60 shadow-xs focus:ring-2 focus:ring-slate-400',
    ghost:
      'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 border border-transparent focus:ring-2 focus:ring-purple-500/30',
    outline:
      'bg-white/60 dark:bg-slate-900/40 hover:bg-white dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300/80 dark:border-slate-700 shadow-xs backdrop-blur-md focus:ring-2 focus:ring-purple-500/30',
    danger:
      'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-md shadow-rose-600/20 border border-rose-500/40 focus:ring-2 focus:ring-rose-500/50',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none focus:outline-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : leftIcon ? (
        <span className="mr-2 inline-flex items-center">{leftIcon}</span>
      ) : null}
      <span>{children}</span>
      {!isLoading && rightIcon ? (
        <span className="ml-2 inline-flex items-center">{rightIcon}</span>
      ) : null}
    </button>
  );
};

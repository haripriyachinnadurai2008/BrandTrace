import React, { useState, useEffect } from 'react';
import { CheckCircleIcon, AlertTriangleIcon, AlertCircleIcon, XIcon } from '../Icons';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

// Global toast emitter
type Listener = (toast: ToastMessage) => void;
let listeners: Listener[] = [];

export const showToast = (toast: Omit<ToastMessage, 'id'>) => {
  const newToast: ToastMessage = {
    ...toast,
    id: Math.random().toString(36).substring(2, 9),
  };
  listeners.forEach(fn => fn(newToast));
};

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handler: Listener = toast => {
      setToasts(prev => [...prev, toast]);
      const duration = toast.duration ?? 4000;
      if (duration > 0) {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toast.id));
        }, duration);
      }
    };

    listeners.push(handler);
    return () => {
      listeners = listeners.filter(l => l !== handler);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(t => {
        const bgStyles = {
          success: 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100',
          error: 'bg-rose-50 dark:bg-rose-950/90 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100',
          warning: 'bg-amber-50 dark:bg-amber-950/90 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100',
          info: 'bg-blue-50 dark:bg-blue-950/90 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-100',
        }[t.type];

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${bgStyles}`}
          >
            <div className="shrink-0 mt-0.5">
              {t.type === 'success' && <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
              {t.type === 'error' && <AlertCircleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
              {t.type === 'warning' && <AlertTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
              {t.type === 'info' && <AlertCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold leading-tight">{t.title}</div>
              {t.message && <div className="text-xs opacity-90 mt-0.5 leading-relaxed">{t.message}</div>}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

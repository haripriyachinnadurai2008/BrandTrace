import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';

interface RouterContextType {
  path: string;
  navigate: (newPath: string) => void;
  tab: string;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [path, setPath] = useState<string>(() => {
    if (typeof window === 'undefined') return '/';
    return window.location.pathname || '/';
  });

  const navigate = useCallback((newPath: string) => {
    if (window.location.pathname !== newPath) {
      window.history.pushState({}, '', newPath);
      setPath(newPath);
      window.scrollTo(0, 0);
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname || '/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Compute active tab for /app/:tab
  let tab = 'findings';
  if (path.startsWith('/app')) {
    const segments = path.replace(/\/+$/, '').split('/');
    if (segments.length >= 3 && segments[2]) {
      tab = segments[2];
    }
  }

  // Route protection: if visiting /app/* and no token (and not in local dev with role switcher allowed), redirect to /login
  useEffect(() => {
    const isDev = import.meta.env.DEV;
    const isRoleSwitcherAllowed =
      import.meta.env.VITE_ALLOW_ROLE_SWITCHER !== 'false' &&
      import.meta.env.MODE !== 'production';

    const token = api.getToken();
    if (path.startsWith('/app') && !token && !isRoleSwitcherAllowed) {
      navigate('/login');
    }
  }, [path, navigate]);

  return (
    <RouterContext.Provider value={{ path, navigate, tab }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = (): RouterContextType => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
};

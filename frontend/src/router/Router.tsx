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

  // Route protection and redirection:
  // If token is missing, invalid or expired when visiting /app/*, clear and redirect to /login.
  // If token is valid when visiting / or /login, redirect to /app/findings.
  useEffect(() => {
    const isTokenValid = api.isTokenValid();

    if (path.startsWith('/app')) {
      if (!isTokenValid) {
        api.logout();
        navigate('/login');
      }
    } else if (path === '/' || path === '/login') {
      if (isTokenValid) {
        navigate('/app/findings');
      }
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

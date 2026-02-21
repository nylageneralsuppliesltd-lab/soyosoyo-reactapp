// src/hooks/useInitializeApp.js
import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Hook to validate session on app startup (after session restore from localStorage)
 * If session exists but is invalid, it will be cleared
 */
export const useInitializeApp = () => {
  const { session, isAuthenticated } = useAuth();
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) {
      return;
    }

    initRef.current = true;

    // Session validation happens in AuthContext via the token expiry check
    // This hook just ensures the app is aware of the session state on startup
    if (isAuthenticated) {
      console.debug('App initialized with active session');
    }
  }, [isAuthenticated]);

  return { isReady: Boolean(session) };
};

export default useInitializeApp;


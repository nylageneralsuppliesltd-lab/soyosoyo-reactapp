import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  loginProfile,
  registerProfile,
  toggleDeveloperMode,
  createSaccoProfile,
  listUserSaccos,
  getDeveloperOverview,
  getAuthSession,
} from '../utils/authAPI';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const decodeTokenPayload = (token) => {
    try {
      const base64 = token.split('.')[1];
      if (!base64) return null;
      const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem('authSession');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const persistSession = (payload) => {
    setSession(payload);
    localStorage.setItem('authSession', JSON.stringify(payload));
  };

  const clearSession = () => {
    setSession(null);
    localStorage.removeItem('authSession');
  };

  const login = async (identifier, password) => {
    const res = await loginProfile({ identifier, password });
    persistSession(res.data);
    return res.data;
  };

  const register = async (payload) => {
    const res = await registerProfile(payload);
    persistSession(res.data);
    return res.data;
  };

  const setDeveloperMode = async (enabled) => {
    if (!session?.token) {
      throw new Error('Login first to toggle developer mode');
    }

    const res = await toggleDeveloperMode({ enabled });
    persistSession(res.data);
    return res.data;
  };

  const createSacco = async ({ name, registrationNumber }) => {
    if (!session?.token) throw new Error('Re-login required');
    return (await createSaccoProfile({ name, registrationNumber })).data;
  };

  const getMySaccos = async () => {
    if (!session?.token) throw new Error('Re-login required');
    return (await listUserSaccos()).data;
  };

  const getOverview = async () => {
    if (!session?.token) throw new Error('Re-login required');
    return (await getDeveloperOverview()).data;
  };

  const refreshSession = async () => {
    if (!session?.token) return null;
    const res = await getAuthSession();
    persistSession(res.data);
    return res.data;
  };

  useEffect(() => {
    const onExpired = () => {
      clearSession();
      localStorage.setItem('authLogoutReason', 'Your session expired. Please log in again.');
    };

    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  useEffect(() => {
    if (!session?.token) return;

    const run = async () => {
      const payload = decodeTokenPayload(session.token);
      if (!payload?.exp) return;

      const nowSeconds = Math.floor(Date.now() / 1000);
      const secondsToExpiry = payload.exp - nowSeconds;

      if (secondsToExpiry <= 0) {
        clearSession();
        localStorage.setItem('authLogoutReason', 'Your session expired. Please log in again.');
        return;
      }

      if (secondsToExpiry <= 600) {
        try {
          await refreshSession();
        } catch {
          clearSession();
          localStorage.setItem('authLogoutReason', 'Session refresh failed. Please log in again.');
        }
      }
    };

    run();
    const interval = setInterval(run, 60000);
    return () => clearInterval(interval);
  }, [session?.token]);

  const value = useMemo(() => ({
    session,
    isAuthenticated: Boolean(session?.token),
    login: async (identifier, password) => {
      const data = await login(identifier, password);
      persistSession(data);
      return data;
    },
    register,
    refreshSession,
    setDeveloperMode,
    createSacco,
    getMySaccos,
    getOverview,
    logout: clearSession,
  }), [session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;

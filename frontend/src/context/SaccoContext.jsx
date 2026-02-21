// SaccoContext.jsx - Global SACCO configuration management
import { createContext, useState, useContext, useEffect } from 'react';

const SaccoContext = createContext();

export const useSacco = () => {
  const context = useContext(SaccoContext);
  if (!context) {
    throw new Error('useSacco must be used within SaccoProvider');
  }
  return context;
};

export const SaccoProvider = ({ children }) => {
  const getDeveloperMode = () => {
    try {
      const raw = localStorage.getItem('authSession');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.user?.isSystemDeveloper && parsed?.user?.developerMode);
    } catch {
      return false;
    }
  };

  const isSaccoExpired = (sacco) => {
    if (!sacco?.trialEndsAt) return false;
    if (sacco.subscriptionStatus === 'active') return false;
    return new Date(sacco.trialEndsAt) < new Date();
  };

  // Default SACCO configuration
  const defaultSacco = {
    id: 'sacco_001',
    name: 'Soyosoyo SACCO',
    slogan: 'Empowering Your Financial Future',
    registrationNumber: 'REG/SACCO/2010/001',
    phone: '+254 (0) 700 123 456',
    email: 'info@soyosoyosacco.com',
    website: 'www.soyosoyosacco.com',
    address: 'P.O. Box 12345, Nairobi, Kenya',
    logo: 'SS', // Circle initials
    theme: {
      primary: '#2563eb',
      success: '#10b981',
      warning: '#f59e0b',
      danger: '#ef4444',
    },
    subscriptionStatus: 'trial',
    trialStartsAt: new Date().toISOString(),
    trialEndsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    lastPaymentAt: null,
    createdAt: new Date().toISOString(),
  };

  const [currentSacco, setCurrentSacco] = useState(() => {
    try {
      const stored = localStorage.getItem('currentSacco');
      const parsed = stored ? JSON.parse(stored) : null;
      // Validate that it's a proper object, not NaN or invalid
      return (parsed && typeof parsed === 'object' && parsed.id) ? parsed : defaultSacco;
    } catch (error) {
      console.error('Error loading currentSacco from localStorage:', error);
      return defaultSacco;
    }
  });

  const [saccos, setSaccos] = useState(() => {
    const stored = localStorage.getItem('saccos');
    return stored ? JSON.parse(stored) : [defaultSacco];
  });

  // Save current SACCO to localStorage
  useEffect(() => {
    try {
      if (currentSacco && typeof currentSacco === 'object') {
        localStorage.setItem('currentSacco', JSON.stringify(currentSacco));
      }
    } catch (error) {
      console.error('Error saving currentSacco to localStorage:', error);
    }
  }, [currentSacco]);

  // Save all SACCOs to localStorage
  useEffect(() => {
    try {
      if (Array.isArray(saccos) && saccos.length > 0) {
        localStorage.setItem('saccos', JSON.stringify(saccos));
      }
    } catch (error) {
      console.error('Error saving saccos to localStorage:', error);
    }
  }, [saccos]);

  // Switch to a different SACCO
  const switchSacco = (saccoId) => {
    const sacco = saccos.find((s) => s.id === saccoId);
    if (sacco) {
      if (isSaccoExpired(sacco) && !getDeveloperMode()) {
        return;
      }
      setCurrentSacco(sacco);
    }
  };

  // Create a new SACCO
  const createSacco = (saccoData) => {
    const newSacco = {
      id: `sacco_${Date.now()}`,
      ...saccoData,
      subscriptionStatus: 'trial',
      trialStartsAt: new Date().toISOString(),
      trialEndsAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      lastPaymentAt: null,
      createdAt: new Date().toISOString(),
    };
    setSaccos([...saccos, newSacco]);
    setCurrentSacco(newSacco);
    return newSacco;
  };

  // Update current SACCO
  const updateSacco = (updates) => {
    const updated = { ...currentSacco, ...updates };
    setCurrentSacco(updated);
    setSaccos(saccos.map((s) => (s.id === updated.id ? updated : s)));
  };

  // Delete a SACCO
  const deleteSacco = (saccoId) => {
    const filtered = saccos.filter((s) => s.id !== saccoId);
    setSaccos(filtered);
    if (currentSacco.id === saccoId && filtered.length > 0) {
      setCurrentSacco(filtered[0]);
    }
  };

  return (
    <SaccoContext.Provider
      value={{
        currentSacco,
        saccos,
        isSaccoExpired,
        switchSacco,
        createSacco,
        updateSacco,
        deleteSacco,
      }}
    >
      {children}
    </SaccoContext.Provider>
  );
};

export default SaccoContext;

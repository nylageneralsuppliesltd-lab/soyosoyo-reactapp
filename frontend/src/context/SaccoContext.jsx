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
    createdAt: new Date().toISOString(),
  };

  const [currentSacco, setCurrentSacco] = useState(() => {
    const stored = localStorage.getItem('currentSacco');
    return stored ? JSON.parse(stored) : defaultSacco;
  });

  const [saccos, setSaccos] = useState(() => {
    const stored = localStorage.getItem('saccos');
    return stored ? JSON.parse(stored) : [defaultSacco];
  });

  // Save current SACCO to localStorage
  useEffect(() => {
    localStorage.setItem('currentSacco', JSON.stringify(currentSacco));
  }, [currentSacco]);

  // Save all SACCOs to localStorage
  useEffect(() => {
    localStorage.setItem('saccos', JSON.stringify(saccos));
  }, [saccos]);

  // Switch to a different SACCO
  const switchSacco = (saccoId) => {
    const sacco = saccos.find((s) => s.id === saccoId);
    if (sacco) {
      setCurrentSacco(sacco);
    }
  };

  // Create a new SACCO
  const createSacco = (saccoData) => {
    const newSacco = {
      id: `sacco_${Date.now()}`,
      ...saccoData,
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

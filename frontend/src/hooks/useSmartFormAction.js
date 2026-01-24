import { useNavigate } from 'react-router-dom';
import { useCallback } from 'react';

/**
 * Hook for smart form navigation
 * Intelligently routes users to the right settings section to add missing items
 */
export const useSmartFormAction = () => {
  const navigate = useNavigate();

  const handleAddNew = useCallback((type) => {
    // Map of action types to navigation paths
    const navigationMap = {
      // Bank Accounts
      bank_account: '/settings?section=bank-accounts&action=add',
      
      // Expense Categories
      expense_category: '/settings?section=expense-categories&action=add',
      
      // Deposit Categories
      deposit_category: '/settings?section=deposit-categories&action=add',
      contribution_type: '/settings?section=deposit-categories&action=add',
      share_capital: '/settings?section=deposit-categories&action=add',
      
      // Loan Types
      loan_type: '/settings?section=loan-types&action=add',
      
      // General fallback
      default: '/settings',
    };

    const path = navigationMap[type] || navigationMap.default;
    
    // Store the context so the settings page knows what we're adding
    sessionStorage.setItem('addNewContext', JSON.stringify({
      type,
      timestamp: Date.now(),
      returnPath: window.location.pathname,
    }));

    navigate(path);
  }, [navigate]);

  return { handleAddNew };
};

/**
 * Hook for retrieving the add new context from settings page
 */
export const useAddNewContext = () => {
  const contextString = sessionStorage.getItem('addNewContext');
  if (!contextString) return null;

  try {
    return JSON.parse(contextString);
  } catch {
    return null;
  }
};

/**
 * Hook for clearing the add new context
 */
export const useClearAddNewContext = () => {
  return () => {
    sessionStorage.removeItem('addNewContext');
  };
};

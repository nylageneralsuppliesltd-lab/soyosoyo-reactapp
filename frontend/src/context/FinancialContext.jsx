// FinancialContext.jsx - Backend-backed financial data store
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  getDeposits,
  createDeposit,
  updateDeposit,
  deleteDeposit,
  getWithdrawals,
  createWithdrawal,
  updateWithdrawal,
  deleteWithdrawal,
  getLoans,
  createLoan,
  updateLoan,
  deleteLoan,
  getRepayments,
  createRepayment,
  updateRepayment,
  deleteRepayment,
} from '../components/members/financeAPI';

const FinancialContext = createContext(null);

const defaultState = {
  deposits: [],
  withdrawals: [],
  loans: [],
  repayments: [],
  loading: true,
  error: null,
};

export const FinancialProvider = ({ children }) => {
  const [data, setData] = useState(defaultState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load data from backend on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [depositsRes, withdrawalsRes, loansRes, repaymentsRes] = await Promise.all([
          getDeposits(1000),
          getWithdrawals(1000),
          getLoans(1000),
          getRepayments(1000),
        ]);

        setData({
          deposits: depositsRes.data || [],
          withdrawals: withdrawalsRes.data || [],
          loans: loansRes.data || [],
          repayments: repaymentsRes.data || [],
        });
        setError(null);
      } catch (err) {
        console.error('[FinancialContext] Failed to load data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const addDeposit = async (payload) => {
    try {
      const depositData = {
        memberName: payload.member?.trim() || 'Unspecified',
        memberId: payload.memberId || null,
        amount: payload.amount,
        method: payload.method || 'cash',
        reference: payload.reference?.trim() || '',
        date: payload.date || new Date().toISOString().slice(0, 10),
        notes: payload.notes?.trim() || '',
      };
      const response = await createDeposit(depositData);
      setData((prev) => ({ ...prev, deposits: [response.data, ...prev.deposits] }));
      return response.data;
    } catch (err) {
      console.error('[FinancialContext] Failed to add deposit:', err);
      throw err;
    }
  };

  const addWithdrawal = async (payload) => {
    try {
      const withdrawalData = {
        memberName: payload.member?.trim() || 'Unspecified',
        memberId: payload.memberId || null,
        amount: payload.amount,
        method: payload.method || 'cash',
        purpose: payload.purpose?.trim() || 'General',
        date: payload.date || new Date().toISOString().slice(0, 10),
        notes: payload.notes?.trim() || '',
      };
      const response = await createWithdrawal(withdrawalData);
      setData((prev) => ({ ...prev, withdrawals: [response.data, ...prev.withdrawals] }));
      return response.data;
    } catch (err) {
      console.error('[FinancialContext] Failed to add withdrawal:', err);
      throw err;
    }
  };

  const addLoan = async (payload) => {
    try {
      const loanData = {
        borrowerName: payload.borrower?.trim() || 'Unspecified',
        borrowerId: payload.borrowerId || null,
        amount: payload.amount,
        rate: payload.rate || 0,
        termMonths: payload.termMonths || 0,
        startDate: payload.startDate || new Date().toISOString().slice(0, 10),
        status: payload.status || 'Active',
        purpose: payload.purpose?.trim() || '',
      };
      const response = await createLoan(loanData);
      setData((prev) => ({ ...prev, loans: [response.data, ...prev.loans] }));
      return response.data;
    } catch (err) {
      console.error('[FinancialContext] Failed to add loan:', err);
      throw err;
    }
  };

  const addRepayment = async (payload) => {
    try {
      const repaymentData = {
        loanId: payload.loanId,
        amount: payload.amount,
        date: payload.date || new Date().toISOString().slice(0, 10),
        method: payload.method || 'cash',
        notes: payload.notes?.trim() || '',
      };
      const response = await createRepayment(repaymentData);
      setData((prev) => ({ ...prev, repayments: [response.data, ...prev.repayments] }));
      return response.data;
    } catch (err) {
      console.error('[FinancialContext] Failed to add repayment:', err);
      throw err;
    }
  };

  const deleteDepositEntry = async (id) => {
    try {
      await deleteDeposit(id);
      setData((prev) => ({ ...prev, deposits: prev.deposits.filter((item) => item.id !== id) }));
    } catch (err) {
      console.error('[FinancialContext] Failed to delete deposit:', err);
      throw err;
    }
  };

  const updateDepositEntry = async (id, payload) => {
    try {
      const response = await updateDeposit(id, payload);
      setData((prev) => ({
        ...prev,
        deposits: prev.deposits.map((item) => (item.id === id ? response.data : item)),
      }));
      return response.data;
    } catch (err) {
      console.error('[FinancialContext] Failed to update deposit:', err);
      throw err;
    }
  };

  const deleteWithdrawalEntry = async (id) => {
    try {
      await deleteWithdrawal(id);
      setData((prev) => ({ ...prev, withdrawals: prev.withdrawals.filter((item) => item.id !== id) }));
    } catch (err) {
      console.error('[FinancialContext] Failed to delete withdrawal:', err);
      throw err;
    }
  };

  const updateWithdrawalEntry = async (id, payload) => {
    try {
      const response = await updateWithdrawal(id, payload);
      setData((prev) => ({
        ...prev,
        withdrawals: prev.withdrawals.map((item) => (item.id === id ? response.data : item)),
      }));
      return response.data;
    } catch (err) {
      console.error('[FinancialContext] Failed to update withdrawal:', err);
      throw err;
    }
  };

  const deleteLoanEntry = async (id) => {
    try {
      await deleteLoan(id);
      setData((prev) => ({ ...prev, loans: prev.loans.filter((item) => item.id !== id) }));
    } catch (err) {
      console.error('[FinancialContext] Failed to delete loan:', err);
      throw err;
    }
  };

  const updateLoanEntry = async (id, payload) => {
    try {
      const response = await updateLoan(id, payload);
      setData((prev) => ({
        ...prev,
        loans: prev.loans.map((item) => (item.id === id ? response.data : item)),
      }));
      return response.data;
    } catch (err) {
      console.error('[FinancialContext] Failed to update loan:', err);
      throw err;
    }
  };

  const deleteRepaymentEntry = async (id) => {
    try {
      await deleteRepayment(id);
      setData((prev) => ({ ...prev, repayments: prev.repayments.filter((item) => item.id !== id) }));
    } catch (err) {
      console.error('[FinancialContext] Failed to delete repayment:', err);
      throw err;
    }
  };

  const updateRepaymentEntry = async (id, payload) => {
    try {
      const response = await updateRepayment(id, payload);
      setData((prev) => ({
        ...prev,
        repayments: prev.repayments.map((item) => (item.id === id ? response.data : item)),
      }));
      return response.data;
    } catch (err) {
      console.error('[FinancialContext] Failed to update repayment:', err);
      throw err;
    }
  };

  const value = useMemo(() => ({
    ...data,
    loading,
    error,
    addDeposit,
    addWithdrawal,
    addLoan,
    addRepayment,
    updateDeposit: updateDepositEntry,
    updateWithdrawal: updateWithdrawalEntry,
    updateLoan: updateLoanEntry,
    updateRepayment: updateRepaymentEntry,
    deleteDeposit: deleteDepositEntry,
    deleteWithdrawal: deleteWithdrawalEntry,
    deleteLoan: deleteLoanEntry,
    deleteRepayment: deleteRepaymentEntry,
  }), [data, loading, error]);

  return (
    <FinancialContext.Provider value={value}>{children}</FinancialContext.Provider>
  );
};

export const useFinancial = () => {
  const ctx = useContext(FinancialContext);
  if (!ctx) throw new Error('useFinancial must be used within FinancialProvider');
  return ctx;
};

export default FinancialContext;


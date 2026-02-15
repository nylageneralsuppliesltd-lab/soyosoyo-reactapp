import API from './membersAPI';

// Export the API instance for direct use in components
export const financeAPI = API;

// Deposits
export const getDeposits = (take = 100, skip = 0) =>
  API.get(`/deposits?take=${take}&skip=${skip}`);

export const getDeposit = (id) => API.get(`/deposits/${id}`);

export const createDeposit = (data) => API.post('/deposits', data);

export const updateDeposit = (id, data) => API.patch(`/deposits/${id}`, data);

export const deleteDeposit = (id) => API.delete(`/deposits/${id}`);

export const voidDeposit = (id, data) => API.post(`/deposits/${id}/void`, data);

export const getDepositsByMember = (memberId) =>
  API.get(`/deposits/member/${memberId}`);

// Withdrawals
export const getWithdrawals = (take = 100, skip = 0) =>
  API.get(`/withdrawals?take=${take}&skip=${skip}`);

export const getWithdrawal = (id) => API.get(`/withdrawals/${id}`);

export const createWithdrawal = (data) => API.post('/withdrawals', data);

export const updateWithdrawal = (id, data) =>
  API.patch(`/withdrawals/${id}`, data);

export const deleteWithdrawal = (id) => API.delete(`/withdrawals/${id}`);

export const voidWithdrawal = (id, data) => API.post(`/withdrawals/${id}/void`, data);

export const getWithdrawalsByMember = (memberId) =>
  API.get(`/withdrawals/member/${memberId}`);

// Loans
export const getLoans = (take = 100, skip = 0) =>
  API.get(`/loans?take=${take}&skip=${skip}`);

export const getLoan = (id) => API.get(`/loans/${id}`);

export const createLoan = (data) => API.post('/loans', data);

export const updateLoan = (id, data) => API.patch(`/loans/${id}`, data);

export const deleteLoan = (id) => API.delete(`/loans/${id}`);

export const getLoansByBorrower = (borrowerId) =>
  API.get(`/loans/borrower/${borrowerId}`);

export const getLoansByStatus = (status) =>
  API.get(`/loans/status/${status}`);

// Repayments
export const getRepayments = (take = 100, skip = 0) =>
  API.get(`/repayments?take=${take}&skip=${skip}`);

export const getRepayment = (id) => API.get(`/repayments/${id}`);

export const createRepayment = (data) => API.post('/repayments', data);

export const updateRepayment = (id, data) =>
  API.patch(`/repayments/${id}`, data);

export const deleteRepayment = (id) => API.delete(`/repayments/${id}`);

export const getRepaymentsByLoan = (loanId) =>
  API.get(`/repayments/loan/${loanId}`);

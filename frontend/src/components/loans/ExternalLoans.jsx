// ExternalLoans.jsx - Loans to Non-Members
import React, { useState, useEffect } from 'react';
import { Plus, Eye, Loader, AlertCircle, Trash2 } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';


function BackendAmortizationTable({ loanId }) {
  const [schedule, setSchedule] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!loanId) return;
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/loans/${loanId}/amortization`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.schedule)) {
          setSchedule(data.schedule);
        } else {
          setError(data.message || 'Failed to load schedule');
        }
      })
      .catch(err => setError(err.message || 'Failed to load schedule'))
      .finally(() => setLoading(false));
  }, [loanId]);

  if (!loanId) return null;
  if (loading) return <div>Loading amortization table...</div>;
  if (error) return <div className="error-text">{error}</div>;
  if (!schedule || schedule.length === 0) return <div>No amortization schedule available.</div>;

  return (
    <table className="amortization-table">
      <thead>
        <tr>
          <th>Installment</th>
          <th>Principal</th>
          <th>Interest</th>
          <th>Total</th>
          <th>Due Date</th>
          <th>Paid</th>
        </tr>
      </thead>
      <tbody>
        {schedule.map((row, idx) => (
          <tr key={idx}>
            <td>{row.installment || row.month || idx + 1}</td>
            <td>KES {Number(row.principal).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td>KES {Number(row.interest).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td>KES {Number(row.total || row.payment).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            <td>{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '--'}</td>
            <td>{row.paid ? 'Yes' : 'No'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LoanStatement({ statement }) {
  if (!statement) return <div>No statement available.</div>;
  return (
    <div>
      <h5>Repayments</h5>
      {Array.isArray(statement.repayments) && statement.repayments.length > 0 ? (
        <table className="statement-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Type</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {statement.repayments.map((r, idx) => (
              <tr key={idx}>
                <td>{r.date ? new Date(r.date).toLocaleDateString() : '--'}</td>
                <td>KES {Number(r.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{r.type || 'Repayment'}</td>
                <td>{r.reference || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div>No repayments recorded.</div>}
      <h5>Fines</h5>
      {Array.isArray(statement.fines) && statement.fines.length > 0 ? (
        <table className="statement-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {statement.fines.map((f, idx) => (
              <tr key={idx}>
                <td>{f.date ? new Date(f.date).toLocaleDateString() : '--'}</td>
                <td>KES {Number(f.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{f.reason || '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <div>No fines recorded.</div>}

    </div>
  );
}

const ExternalLoans = ({ onError }) => {
  const [loans, setLoans] = useState([]);
  const [loanTypes, setLoanTypes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [formData, setFormData] = useState({
    externalName: '',
    email: '',
    phone: '',
    idNumber: '',
    typeId: '',
    accountId: '',
    amount: '',
    periodMonths: '',
    disbursementDate: new Date().toISOString().split('T')[0],
    purpose: '',
    collateral: '',
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [loansRes, typesRes, accountsRes] = await Promise.all([
        fetch(`${API_BASE}/loans?external=true`),
        fetch(`${API_BASE}/loan-types`),
        fetch(`${API_BASE}/accounts`),
      ]);

      if (!loansRes.ok || !typesRes.ok || !accountsRes.ok) throw new Error('Failed to fetch data');

      const loansData = await loansRes.json();
      const typesData = await typesRes.json();
      const accountsData = await accountsRes.json();

      // Handle both array and wrapped responses
      const loansArray = Array.isArray(loansData) ? loansData : (loansData.data || []);
      const typesArray = Array.isArray(typesData) ? typesData : (typesData.data || []);
      const accountsArray = Array.isArray(accountsData) ? accountsData : (accountsData.data || []);
      // Filter to only bank/cash/mobile accounts (exclude GL accounts)
      const bankAccounts = accountsArray.filter(a => 
        ['cash', 'bank', 'mobileMoney', 'pettyCash'].includes(a.type) && 
        !a.name.includes('GL:') && 
        !a.name.includes('General Ledger')
      );

      setLoans(loansArray);
      setLoanTypes(typesArray);
      setAccounts(bankAccounts);
      
      // Debug log
      if (import.meta.env.DEV) {
        console.log('Loan types loaded:', typesArray.length);
        console.log('Accounts loaded:', bankAccounts.length);
      }
    } catch (err) {
      onError?.(err.message);
      if (import.meta.env.DEV) {
        console.error('Fetch error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.externalName) errors.externalName = 'Name is required';
    if (!formData.phone) errors.phone = 'Phone is required';
    if (!formData.typeId) errors.typeId = 'Loan type is required';
    if (!formData.accountId) errors.accountId = 'Disbursement account is required';

    if (!formData.amount || parseFloat(formData.amount) <= 0) errors.amount = 'Valid amount is required';
    if (!formData.periodMonths || parseInt(formData.periodMonths) < 1) errors.periodMonths = 'Valid period is required';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ...rest of the ExternalLoans component (render, handlers, etc.)
  // Ensure the function is properly closed before export
  return null; // TODO: Replace with actual JSX render logic
}

export default ExternalLoans;

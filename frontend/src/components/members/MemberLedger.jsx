
import React, { useEffect, useState } from 'react';
import { getLedger } from './membersAPI';

export default function MemberLedger({ member, goBack }) {
  const [ledger, setLedger] = useState([]);
  const [summary, setSummary] = useState({});

  useEffect(() => {
    const fetchLedger = async () => {
      const res = await getLedger(member.id);
      setLedger(res.data.ledger);

      // Summarize deposit types
      let registration = 0, shareCapital = 0, riskFund = 0, misc = 0;
      let totalDeposits = 0, totalLoans = 0, outstandingLoans = 0, fullyRepaidLoans = 0;
      let loanIds = new Set();
      let loanBalances = {};
      let repayments = 0, expectedRepayments = 0, repaymentCount = 0, onTimeRepayments = 0;

      res.data.ledger.forEach(tx => {
        // Deposit types (customize as needed)
        if (tx.type === 'Registration') registration += tx.amount;
        else if (tx.type === 'Share Capital') shareCapital += tx.amount;
        else if (tx.type === 'Risk Fund') riskFund += tx.amount;
        else if (tx.type === 'Miscellaneous') misc += tx.amount;
        else if (['Contribution','Deposit','Share Contribution'].includes(tx.type)) totalDeposits += tx.amount;

        // Loans
        if (tx.type === 'Loan Disbursement') {
          totalLoans += tx.amount;
          loanIds.add(tx.reference || tx.id);
          loanBalances[tx.reference || tx.id] = (loanBalances[tx.reference || tx.id] || 0) + tx.amount;
        }
        if (tx.type === 'Loan Repayment') {
          repayments += tx.amount;
          // Try to link to loan by reference
          if (tx.reference && loanBalances[tx.reference] !== undefined) {
            loanBalances[tx.reference] -= tx.amount;
          }
        }
      });
      // Calculate outstanding and fully repaid loans
      Object.values(loanBalances).forEach(balance => {
        if (balance > 0.01) outstandingLoans += balance;
        else fullyRepaidLoans += 1;
      });

      // Promptness grade (simple: ratio of repayments to loans, or customize)
      let promptness = 'N/A';
      if (totalLoans > 0) {
        const ratio = repayments / totalLoans;
        if (ratio >= 1) promptness = 'Excellent';
        else if (ratio >= 0.75) promptness = 'Good';
        else if (ratio >= 0.5) promptness = 'Fair';
        else promptness = 'Poor';
      }

      setSummary({
        registration,
        shareCapital,
        riskFund,
        misc,
        totalDeposits,
        totalLoans,
        outstandingLoans,
        fullyRepaidLoans,
        promptness,
        balance: member.balance,
        status: member.active ? 'Active' : 'Suspended',
      });
    };
    fetchLedger();
  }, [member]);

  return (
    <div>
      <h1>Ledger - {member.name}</h1>
      <div className="member-summary" style={{marginBottom:20,background:'#f8f9fa',padding:16,borderRadius:8}}>
        <h3>Member Summary</h3>
        <ul style={{columns:2}}>
          <li><strong>Status:</strong> {summary.status}</li>
          <li><strong>Registration:</strong> KES {summary.registration?.toLocaleString() || '0.00'}</li>
          <li><strong>Share Capital:</strong> KES {summary.shareCapital?.toLocaleString() || '0.00'}</li>
          <li><strong>Risk Fund:</strong> KES {summary.riskFund?.toLocaleString() || '0.00'}</li>
          <li><strong>Miscellaneous:</strong> KES {summary.misc?.toLocaleString() || '0.00'}</li>
          <li><strong>Other Deposits:</strong> KES {summary.totalDeposits?.toLocaleString() || '0.00'}</li>
          <li><strong>Total Loans Taken:</strong> KES {summary.totalLoans?.toLocaleString() || '0.00'}</li>
          <li><strong>Outstanding Loan Balance:</strong> KES {summary.outstandingLoans?.toLocaleString() || '0.00'}</li>
          <li><strong>Fully Repaid Loans:</strong> {summary.fullyRepaidLoans || 0}</li>
          <li><strong>Promptness Grade:</strong> {summary.promptness}</li>
          <li><strong>Current Balance:</strong> KES {summary.balance?.toLocaleString() || '0.00'}</li>
        </ul>
      </div>
      <table>
        <thead>
          <tr><th>Date</th><th>Type</th><th>Amount</th><th>Reference</th><th>Description</th><th>Balance After</th></tr>
        </thead>
        <tbody>
          {ledger.length === 0 ? <tr><td colSpan={6}>No transactions</td></tr> :
            ledger.map(tx => (
              <tr key={tx.id}>
                <td>{new Date(tx.date).toLocaleDateString()}</td>
                <td>{tx.type}</td>
                <td>{tx.amount}</td>
                <td><small>{tx.reference || '-'}</small></td>
                <td>{tx.description || '-'}</td>
                <td>{tx.balanceAfter}</td>
              </tr>
            ))
          }
        </tbody>
      </table>
      <button onClick={goBack}>Back</button>
    </div>
  );
}

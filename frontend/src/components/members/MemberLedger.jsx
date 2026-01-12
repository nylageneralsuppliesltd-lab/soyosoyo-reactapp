import React, { useEffect, useState } from 'react';
import { getLedger } from './membersAPI';

export default function MemberLedger({ member, goBack }) {
  const [ledger, setLedger] = useState([]);
  const [summary, setSummary] = useState({ contributions: 0, loansOut: 0, balance: member.balance });

  useEffect(() => {
    const fetchLedger = async () => {
      const res = await getLedger(member.id);
      setLedger(res.data.ledger);

      let contributions = 0, loansOut = 0;
      res.data.ledger.forEach(tx => {
        if (['Contribution','Deposit','Share Contribution','Loan Repayment'].includes(tx.type)) contributions += tx.amount;
        if (tx.type === 'Loan Disbursement') loansOut += tx.amount;
      });
      setSummary({ contributions, loansOut, balance: member.balance });
    };
    fetchLedger();
  }, [member]);

  return (
    <div>
      <h1>Ledger - {member.name}</h1>
      <p>Status: {member.active ? 'Active' : 'Suspended'} | Contributions: {summary.contributions} | Loans: {summary.loansOut} | Balance: {summary.balance}</p>
      <table>
        <thead>
          <tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th><th>Balance After</th></tr>
        </thead>
        <tbody>
          {ledger.length === 0 ? <tr><td colSpan={5}>No transactions</td></tr> :
            ledger.map(tx => (
              <tr key={tx.id}>
                <td>{new Date(tx.date).toLocaleDateString()}</td>
                <td>{tx.type}</td>
                <td>{tx.amount}</td>
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

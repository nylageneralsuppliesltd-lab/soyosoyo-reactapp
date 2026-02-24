import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Calendar, DollarSign, FileText, Users } from 'lucide-react';
import { API_BASE } from '../../utils/apiBase';

const ContributionTransferForm = ({ onSuccess, onCancel }) => {
  const [members, setMembers] = useState([]);
  const [contributionTypes, setContributionTypes] = useState([]);
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    fromMemberId: '',
    transferScenario: 'contribution_to_loan',
    fromContributionType: '',
    toMemberId: '',
    toLoanId: '',
    amount: '',
    description: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [membersRes, contribRes, loansRes] = await Promise.all([
          fetch(`${API_BASE}/members`),
          fetch(`${API_BASE}/settings/contribution-types`),
          fetch(`${API_BASE}/loans?take=1000&skip=0`),
        ]);

        const membersData = membersRes.ok ? await membersRes.json() : [];
        const contribData = contribRes.ok ? await contribRes.json() : [];
        const loansData = loansRes.ok ? await loansRes.json() : [];

        const membersList = Array.isArray(membersData)
          ? membersData
          : membersData.data || [];

        const loansList = Array.isArray(loansData)
          ? loansData
          : loansData.data || [];

        setMembers(membersList);
        setContributionTypes(Array.isArray(contribData) ? contribData : []);
        setLoans(loansList);
      } catch (err) {
        console.error('Failed loading contribution transfer options:', err);
      }
    };

    load();
  }, []);

  const selectedMemberLoans = useMemo(() => {
    const memberId = Number(form.fromMemberId);
    if (!memberId) return [];
    return loans.filter((loan) => Number(loan.memberId) === memberId && String(loan.status).toLowerCase() !== 'closed');
  }, [loans, form.fromMemberId]);

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!form.date) throw new Error('Contribution transfer date is required');
      if (!form.fromMemberId) throw new Error('Transfer From member is required');
      if (!form.fromContributionType) throw new Error('Select Contribution /Loan From is required');
      if (!form.amount || Number(form.amount) <= 0) throw new Error('Amount must be greater than zero');

      let endpoint = `${API_BASE}/contribution-transfers`;
      let payload = {};

      if (form.transferScenario === 'contribution_to_loan') {
        if (!form.toLoanId) throw new Error('Select Transfer To (Loan) is required');
        endpoint = `${API_BASE}/contribution-transfers/contribution-to-loan`;
        payload = {
          date: form.date,
          memberId: Number(form.fromMemberId),
          fromContributionType: form.fromContributionType,
          toLoanId: Number(form.toLoanId),
          amount: Number(form.amount),
          description: form.description || 'Contribution transfer to loan share',
        };
      } else {
        if (!form.toMemberId) throw new Error('Select Member is required');
        if (Number(form.toMemberId) === Number(form.fromMemberId)) {
          throw new Error('Transfer From and Select Member cannot be the same');
        }
        endpoint = `${API_BASE}/contribution-transfers/member-to-member`;
        payload = {
          date: form.date,
          fromMemberId: Number(form.fromMemberId),
          fromSource: 'contribution',
          fromContributionType: form.fromContributionType,
          toMemberId: Number(form.toMemberId),
          toDestination: 'contribution',
          amount: Number(form.amount),
          description: form.description || 'Contribution transfer to another member',
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to record contribution transfer');
      }

      setSuccess('Contribution transfer recorded successfully');
      setForm((prev) => ({
        ...prev,
        amount: '',
        description: '',
        toMemberId: '',
        toLoanId: '',
      }));

      setTimeout(() => {
        if (onSuccess) onSuccess();
        if (onCancel) onCancel();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Failed to record contribution transfer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-container">
      <div className="form-header-section">
        <ArrowRightLeft size={32} className="form-icon" />
        <h2>Record Contribution Transfers</h2>
        <p>Move value between member contribution and loan ledgers (GL-level, no bank cash movement)</p>
      </div>

      {error && <div className="form-alert error"><strong>Error:</strong> {error}</div>}
      {success && <div className="form-alert success"><strong>Success:</strong> {success}</div>}

      <form className="form-card" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="ct-date"><Calendar size={18} /> Contribution transfer date*</label>
          <input id="ct-date" type="date" value={form.date} onChange={(e) => updateForm({ date: e.target.value })} required />
        </div>

        <div className="form-group">
          <label htmlFor="ct-from-member"><Users size={18} /> Transfer From *</label>
          <select id="ct-from-member" value={form.fromMemberId} onChange={(e) => updateForm({ fromMemberId: e.target.value, toLoanId: '', toMemberId: '' })} required>
            <option value="">Select Member</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="ct-from-source"><FileText size={18} /> Select Contribution /Loan From *</label>
          <select id="ct-from-source" value={form.fromContributionType} onChange={(e) => updateForm({ fromContributionType: e.target.value })} required>
            <option value="">Select Contribution /Loan From</option>
            {contributionTypes.map((ct) => (
              <option key={ct.id} value={ct.name}>{ct.name}</option>
            ))}
            {contributionTypes.length === 0 && <option value="Monthly Minimum Contribution">Monthly Minimum Contribution</option>}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="ct-scenario">Select Transfer To *</label>
          <select id="ct-scenario" value={form.transferScenario} onChange={(e) => updateForm({ transferScenario: e.target.value, toLoanId: '', toMemberId: '' })} required>
            <option value="contribution_to_loan">Loan share (same member)</option>
            <option value="member_to_member">Another member</option>
          </select>
        </div>

        {form.transferScenario === 'contribution_to_loan' ? (
          <div className="form-group">
            <label htmlFor="ct-to-loan">Select Transfer To *</label>
            <select id="ct-to-loan" value={form.toLoanId} onChange={(e) => updateForm({ toLoanId: e.target.value })} required>
              <option value="">Select Transfer To</option>
              {selectedMemberLoans.map((loan) => (
                <option key={loan.id} value={loan.id}>
                  {loan.loanType?.name || `Loan #${loan.id}`} (Balance: {Number(loan.balance || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label htmlFor="ct-to-member">Select Member *</label>
            <select id="ct-to-member" value={form.toMemberId} onChange={(e) => updateForm({ toMemberId: e.target.value })} required>
              <option value="">Select Member</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="form-group">
          <label htmlFor="ct-amount"><DollarSign size={18} /> Amount *</label>
          <input
            id="ct-amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Amount"
            value={form.amount}
            onChange={(e) => updateForm({ amount: e.target.value })}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="ct-description"><FileText size={18} /> Description</label>
          <textarea
            id="ct-description"
            rows={3}
            placeholder="Description"
            value={form.description}
            onChange={(e) => updateForm({ description: e.target.value })}
          />
        </div>

        <div className="form-actions">
          <button type="button" className="btn-cancel" onClick={onCancel} disabled={loading}>Cancel</button>
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'Recording...' : 'Record Contribution Transfer'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ContributionTransferForm;

// LoanApplications.jsx - Pending Loan Applications
import React, { useState, useEffect } from 'react';
import { Eye, Check, X, Loader } from 'lucide-react';

const LoanApplications = ({ onError, onLoading }) => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState(null);

  useEffect(() => {
    fetchApplications();
  }, []);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/loans?status=pending');
      if (!response.ok) throw new Error('Failed to fetch applications');
      const data = await response.json();
      setApplications(data.data || []);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  };

  const approveLoan = async (id) => {
    try {
      const response = await fetch(`/api/loans/${id}/approve`, { method: 'PATCH' });
      if (!response.ok) throw new Error('Failed to approve loan');
      setApplications(applications.filter(a => a.id !== id));
      onError?.('Loan approved successfully!');
      setTimeout(() => onError?.(null), 3000);
    } catch (err) {
      onError?.(err.message);
    }
  };

  const rejectLoan = async (id) => {
    try {
      const response = await fetch(`/api/loans/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to reject loan');
      setApplications(applications.filter(a => a.id !== id));
      onError?.('Loan rejected');
      setTimeout(() => onError?.(null), 3000);
    } catch (err) {
      onError?.(err.message);
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <Loader size={32} className="spinner" />
        <p>Loading applications...</p>
      </div>
    );
  }

  return (
    <div className="loans-section">
      <div className="section-header">
        <h2>Pending Loan Applications</h2>
        <p className="section-subtitle">Review and approve pending loan requests</p>
      </div>

      {applications.length === 0 ? (
        <div className="empty-state">
          <AlertCircle size={48} />
          <p>No pending applications at the moment</p>
        </div>
      ) : (
        <div className="loans-table-wrapper">
          <table className="loans-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Applicant / Bank</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Period</th>
                <th>Direction</th>
                <th>Applied Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app, idx) => (
                <tr key={app.id} className="loan-row">
                  <td>{idx + 1}</td>
                  <td className="applicant-name">
                    {app.memberName || app.bankName || 'Unknown'}
                  </td>
                  <td>{app.typeName || 'Standard'}</td>
                  <td className="amount-cell">KES {(app.amount || 0).toLocaleString()}</td>
                  <td>{app.periodMonths} months</td>
                  <td>
                    <span className={`direction-badge ${app.loanDirection}`}>
                      {app.loanDirection === 'outward' ? 'Outward (Asset)' : 'Inward (Liability)'}
                    </span>
                  </td>
                  <td>{new Date(app.createdAt).toLocaleDateString()}</td>
                  <td className="actions-cell">
                    <button
                      className="btn-icon view"
                      title="View Details"
                      onClick={() => setSelectedApp(app)}
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      className="btn-icon approve"
                      title="Approve"
                      onClick={() => approveLoan(app.id)}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      className="btn-icon reject"
                      title="Reject"
                      onClick={() => rejectLoan(app.id)}
                    >
                      <X size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Details Modal */}
      {selectedApp && (
        <div className="modal-overlay" onClick={() => setSelectedApp(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Loan Application Details</h3>
              <button className="modal-close" onClick={() => setSelectedApp(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="details-grid">
                <div className="detail-item">
                  <label>Applicant</label>
                  <p>{selectedApp.memberName || selectedApp.bankName}</p>
                </div>
                <div className="detail-item">
                  <label>Loan Type</label>
                  <p>{selectedApp.typeName || 'Standard'}</p>
                </div>
                <div className="detail-item">
                  <label>Amount</label>
                  <p>KES {(selectedApp.amount || 0).toLocaleString()}</p>
                </div>
                <div className="detail-item">
                  <label>Period</label>
                  <p>{selectedApp.periodMonths} months</p>
                </div>
                <div className="detail-item">
                  <label>Interest Rate</label>
                  <p>{selectedApp.interestRate || 0}%</p>
                </div>
                <div className="detail-item">
                  <label>Direction</label>
                  <p>{selectedApp.loanDirection === 'outward' ? 'Outward' : 'Inward'}</p>
                </div>
                {selectedApp.purpose && (
                  <div className="detail-item full-width">
                    <label>Purpose</label>
                    <p>{selectedApp.purpose}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setSelectedApp(null)}>Close</button>
              <button className="btn-success" onClick={() => { approveLoan(selectedApp.id); setSelectedApp(null); }}>Approve</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import { AlertCircle } from 'lucide-react';

export default LoanApplications;

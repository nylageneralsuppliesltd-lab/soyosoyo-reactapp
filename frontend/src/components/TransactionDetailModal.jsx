import React, { useState, useEffect } from 'react';
import { X, ExternalLink, FileText, Clock, User, DollarSign, Tag, Building, Grid3x3 } from 'lucide-react';
import { API_BASE } from '../utils/apiBase';
import '../styles/transactionDetailModal.css';

const TransactionDetailModal = ({ isOpen, transaction, type, onClose, onEdit }) => {
  const [loanDetails, setLoanDetails] = useState(null);
  const [loadingLoanDetails, setLoadingLoanDetails] = useState(false);

  useEffect(() => {
    if (isOpen && transaction && transaction.loanId && type === 'deposit') {
      fetchLoanDetails(transaction.loanId);
    }
  }, [isOpen, transaction, type]);

  const fetchLoanDetails = async (loanId) => {
    setLoadingLoanDetails(true);
    try {
      const response = await fetch(`${API_BASE}/loans/${loanId}`);
      if (response.ok) {
        const data = await response.json();
        setLoanDetails(data);
      }
    } catch (error) {
      console.error('Error fetching loan details:', error);
    } finally {
      setLoadingLoanDetails(false);
    }
  };

  if (!isOpen || !transaction) return null;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTypeLabel = (transactionType) => {
    const labels = {
      contribution: 'Contribution',
      share_capital: 'Share Capital',
      fine: 'Fine Payment',
      loan_repayment: 'Loan Repayment',
      income: 'Income',
      miscellaneous: 'Miscellaneous',
      expense: 'Expense',
      transfer: 'Account Transfer',
      refund: 'Contribution Refund',
      dividend: 'Dividend Payout',
    };
    return labels[transactionType] || transactionType;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content transaction-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Transaction Details</h2>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          {/* Primary Details */}
          <div className="detail-section">
            <h3 className="section-title">Transaction Information</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <div className="detail-label">
                  <DollarSign size={16} />
                  Amount
                </div>
                <div className="detail-value amount-highlight">
                  {formatCurrency(transaction.amount)}
                </div>
              </div>

              <div className="detail-item">
                <div className="detail-label">
                  <Tag size={16} />
                  Transaction Type
                </div>
                <div className="detail-value type-badge">
                  {getTypeLabel(transaction.type)}
                </div>
              </div>

              <div className="detail-item">
                <div className="detail-label">
                  <Clock size={16} />
                  Date & Time
                </div>
                <div className="detail-value">
                  {formatDate(transaction.date)}
                </div>
              </div>

              <div className="detail-item">
                <div className="detail-label">
                  <Grid3x3 size={16} />
                  Reference
                </div>
                <div className="detail-value">
                  {transaction.reference || 'N/A'}
                </div>
              </div>
            </div>
          </div>

          {/* Member/Category Details */}
          <div className="detail-section">
            <h3 className="section-title">Party Information</h3>
            <div className="detail-grid">
              <div className="detail-item">
                <div className="detail-label">
                  <User size={16} />
                  Member Name
                </div>
                <div className="detail-value">
                  {transaction.memberName || 'No Member'}
                </div>
              </div>

              {transaction.category && (
                <div className="detail-item">
                  <div className="detail-label">
                    <Tag size={16} />
                    Category
                  </div>
                  <div className="detail-value">
                    {transaction.category}
                  </div>
                </div>
              )}

              {transaction.account && (
                <div className="detail-item">
                  <div className="detail-label">
                    <Building size={16} />
                    Account
                  </div>
                  <div className="detail-value">
                    {transaction.account.name || transaction.account}
                  </div>
                </div>
              )}

              {transaction.method && (
                <div className="detail-item">
                  <div className="detail-label">
                    <DollarSign size={16} />
                    Payment Method
                  </div>
                  <div className="detail-value">
                    {transaction.method}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          {(transaction.description || transaction.narration) && (
            <div className="detail-section">
              <h3 className="section-title">Description</h3>
              <div className="detail-description">
                {transaction.description || transaction.narration}
              </div>
            </div>
          )}

          {/* Loan Details for Loan Repayments */}
          {transaction.type === 'loan_repayment' && transaction.loanId && (
            <div className="detail-section loan-section">
              <h3 className="section-title">
                <FileText size={18} />
                Associated Loan Details
              </h3>
              {loadingLoanDetails ? (
                <div className="loading-small">Loading loan details...</div>
              ) : loanDetails ? (
                <div className="detail-grid">
                  <div className="detail-item">
                    <div className="detail-label">Loan ID</div>
                    <div className="detail-value">{loanDetails.loanNumber}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Outstanding Balance</div>
                    <div className="detail-value">
                      {formatCurrency(loanDetails.outstandingBalance)}
                    </div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Total Repaid</div>
                    <div className="detail-value">
                      {formatCurrency(loanDetails.totalRepaid || 0)}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Additional Fields */}
          <div className="detail-section">
            <h3 className="section-title">Additional Information</h3>
            <div className="detail-grid">
              {transaction.id && (
                <div className="detail-item">
                  <div className="detail-label">Transaction ID</div>
                  <div className="detail-value mono">
                    {String(transaction.id).substring(0, 8)}...
                  </div>
                </div>
              )}

              {transaction.createdAt && (
                <div className="detail-item">
                  <div className="detail-label">Recorded At</div>
                  <div className="detail-value">
                    {formatDate(transaction.createdAt)}
                  </div>
                </div>
              )}

              {transaction.updatedAt && (
                <div className="detail-item">
                  <div className="detail-label">Last Updated</div>
                  <div className="detail-value">
                    {formatDate(transaction.updatedAt)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {onEdit && (
            <button className="btn-primary" onClick={() => {
              onEdit(transaction);
              onClose();
            }}>
              Edit Transaction
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailModal;

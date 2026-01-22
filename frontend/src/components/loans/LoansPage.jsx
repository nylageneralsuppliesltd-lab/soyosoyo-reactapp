// LoansPage.jsx - Comprehensive Loans Module
// Features: Loan Applications, Loan Types, Member Loans, External Loans, Bank Loans

import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Building2,
  Users,
  FileText,
  TrendingUp,
  Plus,
  Search,
  AlertCircle,
  Loader,
} from 'lucide-react';
import LoanApplications from './LoanApplications';
import LoanTypes from './LoanTypes';
import MemberLoans from './MemberLoans';
import ExternalLoans from './ExternalLoans';
import BankLoans from './BankLoans';
import '../../styles/loans.css';

const LoansPage = () => {
  const [activeTab, setActiveTab] = useState('applications');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const tabs = [
    { id: 'applications', label: 'Loan Applications', icon: FileText, component: LoanApplications },
    { id: 'types', label: 'Loan Types', icon: TrendingUp, component: LoanTypes },
    { id: 'member-loans', label: 'Member Loans', icon: Users, component: MemberLoans },
    { id: 'external-loans', label: 'External Loans', icon: Building2, component: ExternalLoans },
    { id: 'bank-loans', label: 'Bank Loans', icon: DollarSign, component: BankLoans },
  ];

  const CurrentComponent = tabs.find(t => t.id === activeTab)?.component;

  return (
    <div className="loans-page-container">
      {/* Header */}
      <div className="loans-header">
        <div className="loans-title-section">
          <h1>Loans Management</h1>
          <p className="loans-subtitle">Manage member loans, external loans, and bank borrowings</p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <AlertCircle size={20} />
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="loans-tabs-nav">
        {tabs.map(tab => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`loans-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
            >
              <TabIcon size={18} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="loans-tab-content">
        {loading ? (
          <div className="loading-state">
            <Loader size={32} className="spinner" />
            <p>Loading...</p>
          </div>
        ) : (
          CurrentComponent && <CurrentComponent onError={setError} onLoading={setLoading} />
        )}
      </div>
    </div>
  );
};

export default LoansPage;

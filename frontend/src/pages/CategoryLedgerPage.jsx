import React, { useState, useEffect } from 'react';
import categoryLedgerAPI from '../utils/categoryLedgerAPI';
import '../styles/category-ledger.css';
import ReportHeader from '../components/ReportHeader';

const CategoryLedgerPage = () => {
  const [ledgers, setLedgers] = useState([]);
  const [selectedLedger, setSelectedLedger] = useState(null);
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedType, setSelectedType] = useState(null);
  const [entriesPage, setEntriesPage] = useState(0);
  const [entriesPageSize] = useState(50);
  const [entriesTotal, setEntriesTotal] = useState(0);
  const [entriesLoading, setEntriesLoading] = useState(false);

  // Form states
  const [transactionForm, setTransactionForm] = useState({
    type: 'credit',
    amount: '',
    description: '',
    sourceType: '',
    reference: '',
    narration: '',
  });

  const [transferForm, setTransferForm] = useState({
    fromCategoryLedgerId: '',
    toCategoryLedgerId: '',
    amount: '',
    description: '',
    reference: '',
  });

  // Load all ledgers and summary
  useEffect(() => {
    loadData();
  }, [selectedType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ledgersData, summaryData] = await Promise.all([
        categoryLedgerAPI.getAllLedgers(selectedType),
        categoryLedgerAPI.getSaccoFinancialSummary(),
      ]);

      setLedgers(ledgersData || []);
      setSummary(summaryData);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('Error loading category ledgers');
    } finally {
      setLoading(false);
    }
  };

  const loadLedgerEntries = async (ledgerId, page = 0) => {
    setEntriesLoading(true);
    try {
      const skip = page * entriesPageSize;
      const data = await categoryLedgerAPI.getLedgerEntries(ledgerId, skip, entriesPageSize);
      setEntries(data.entries || []);
      setEntriesTotal(data.total || 0);
      setEntriesPage(page);
    } catch (error) {
      console.error('Failed to load ledger entries:', error);
      alert('Error loading ledger entries');
    } finally {
      setEntriesLoading(false);
    }
  };

  const loadLedgerDetail = async (ledgerId) => {
    try {
      const ledger = ledgers.find((l) => l.id === ledgerId) || null;
      setSelectedLedger(ledger);
      setActiveTab('ledgers');
      await loadLedgerEntries(ledgerId, 0);
    } catch (error) {
      console.error('Failed to load ledger detail:', error);
      alert('Error loading ledger details');
    }
  };

  const handlePostTransaction = async (e) => {
    e.preventDefault();
    if (!selectedLedger || !transactionForm.amount) {
      alert('Please select a ledger and enter amount');
      return;
    }

    try {
      const result = await categoryLedgerAPI.postTransaction(
        selectedLedger.id,
        {
          type: transactionForm.type,
          amount: parseFloat(transactionForm.amount),
          description: transactionForm.description,
          sourceType: transactionForm.sourceType,
          reference: transactionForm.reference,
          narration: transactionForm.narration,
        },
      );

      alert('Transaction posted successfully');
      setTransactionForm({
        type: 'credit',
        amount: '',
        description: '',
        sourceType: '',
        reference: '',
        narration: '',
      });

      // Reload ledger entries and summary
      loadLedgerEntries(selectedLedger.id, 0);
      loadData();
    } catch (error) {
      console.error('Failed to post transaction:', error);
      alert(`Error: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferForm.fromCategoryLedgerId || !transferForm.toCategoryLedgerId) {
      alert('Please select both source and destination ledgers');
      return;
    }

    try {
      await categoryLedgerAPI.transferBetweenCategories({
        fromCategoryLedgerId: parseInt(transferForm.fromCategoryLedgerId),
        toCategoryLedgerId: parseInt(transferForm.toCategoryLedgerId),
        amount: parseFloat(transferForm.amount),
        description: transferForm.description,
        reference: transferForm.reference,
      });

      alert('Transfer completed successfully');
      setTransferForm({
        fromCategoryLedgerId: '',
        toCategoryLedgerId: '',
        amount: '',
        description: '',
        reference: '',
      });

      loadData();
    } catch (error) {
      console.error('Failed to transfer:', error);
      alert(`Error: ${error.response?.data?.message || error.message}`);
    }
  };

  const entriesTotalPages = entriesTotal > 0 ? Math.ceil(entriesTotal / entriesPageSize) : 0;
  const entriesRangeStart = entriesTotal === 0 ? 0 : entriesPage * entriesPageSize + 1;
  const entriesRangeEnd = Math.min(entriesTotal, (entriesPage + 1) * entriesPageSize);

  return (
    <div className="category-ledger-page">
      <ReportHeader title="Category Ledgers" subtitle={selectedType ? `Type: ${selectedType}` : 'All Types'} />
      <div className="ledger-header">
        <h2>Category Ledgers & SACCO Financials</h2>
        <p>Track income and expense categories with automatic ledger posting</p>
      </div>

      {/* Summary Card */}
      {summary && (
        <div className="summary-cards">
          <div className="summary-card income">
            <h4>Total Income</h4>
            <p className="amount">KES {parseFloat(summary.totalIncome).toLocaleString()}</p>
          </div>
          <div className="summary-card expense">
            <h4>Total Expenses</h4>
            <p className="amount">KES {parseFloat(summary.totalExpenses).toLocaleString()}</p>
          </div>
          <div className={`summary-card net ${parseFloat(summary.netResult) >= 0 ? 'profit' : 'loss'}`}>
            <h4>Profit / (Loss)</h4>
            <p className="amount">KES {parseFloat(summary.netResult).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        <button
          className={`tab ${activeTab === 'ledgers' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledgers')}
        >
          Ledgers
        </button>
        <button
          className={`tab ${activeTab === 'transaction' ? 'active' : ''}`}
          onClick={() => setActiveTab('transaction')}
        >
          Post Transaction
        </button>
        <button
          className={`tab ${activeTab === 'transfer' ? 'active' : ''}`}
          onClick={() => setActiveTab('transfer')}
        >
          Transfer
        </button>
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && summary && (
        <div className="summary-tab">
          <div className="summary-section">
            <h3>Income Categories</h3>
            {summary.incomeCategories.length > 0 ? (
              <table className="category-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Balance</th>
                    <th>Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.incomeCategories.map((cat, idx) => (
                    <tr key={idx}>
                      <td>{cat.name}</td>
                      <td className="amount">KES {parseFloat(cat.balance).toLocaleString()}</td>
                      <td>{cat.entries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No income categories</p>
            )}
          </div>

          <div className="summary-section">
            <h3>Expense Categories</h3>
            {summary.expenseCategories.length > 0 ? (
              <table className="category-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Balance</th>
                    <th>Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.expenseCategories.map((cat, idx) => (
                    <tr key={idx}>
                      <td>{cat.name}</td>
                      <td className="amount">KES {parseFloat(cat.balance).toLocaleString()}</td>
                      <td>{cat.entries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No expense categories</p>
            )}
          </div>
        </div>
      )}

      {/* Ledgers Tab */}
      {activeTab === 'ledgers' && (
        <div className="ledgers-tab">
          <div className="filter-buttons">
            <button
              className={`filter-btn ${selectedType === null ? 'active' : ''}`}
              onClick={() => setSelectedType(null)}
            >
              All Categories
            </button>
            <button
              className={`filter-btn ${selectedType === 'income' ? 'active' : ''}`}
              onClick={() => setSelectedType('income')}
            >
              Income
            </button>
            <button
              className={`filter-btn ${selectedType === 'expense' ? 'active' : ''}`}
              onClick={() => setSelectedType('expense')}
            >
              Expenses
            </button>
          </div>

          {loading ? (
            <p>Loading ledgers...</p>
          ) : (
            <div className="ledgers-grid">
              {ledgers.map((ledger) => (
                <div key={ledger.id} className="ledger-card">
                  <div className="ledger-header-card">
                    <h4>{ledger.categoryName}</h4>
                    <span className={`badge ${ledger.categoryType}`}>{ledger.categoryType}</span>
                  </div>
                  <div className="ledger-info">
                    <div className="info-item">
                      <span>Balance:</span>
                      <strong>KES {parseFloat(ledger.balance).toLocaleString()}</strong>
                    </div>
                    <div className="info-item">
                      <span>Total Amount:</span>
                      <strong>KES {parseFloat(ledger.totalAmount).toLocaleString()}</strong>
                    </div>
                    <div className="info-item">
                      <span>Entries:</span>
                      <strong>{ledger.entries.length}</strong>
                    </div>
                  </div>
                  <button
                    className="btn-view"
                    onClick={() => loadLedgerDetail(ledger.id)}
                  >
                    View Details
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Ledger Details */}
          {selectedLedger && (
            <div className="ledger-details">
              <div className="details-header">
                <h3>{selectedLedger.categoryName} - Ledger Entries</h3>
                <button className="btn-close" onClick={() => setSelectedLedger(null)}>
                  ×
                </button>
              </div>

              {entriesLoading ? (
                <p>Loading ledger entries...</p>
              ) : entries.length > 0 ? (
                <>
                  <table className="entries-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Balance After</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{new Date(entry.date).toLocaleDateString()}</td>
                          <td>
                            <span className={`badge ${entry.type}`}>{entry.type}</span>
                          </td>
                          <td>{entry.description}</td>
                          <td className="amount">
                            KES {parseFloat(entry.amount).toLocaleString()}
                          </td>
                          <td className="amount">
                            KES {parseFloat(entry.balanceAfter).toLocaleString()}
                          </td>
                          <td>{entry.sourceType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {entriesTotalPages > 1 && (
                    <div className="pagination-controls">
                      <span>
                        Showing {entriesRangeStart}-{entriesRangeEnd} of {entriesTotal}
                      </span>
                      <div className="pagination-buttons">
                        <button
                          className="btn-secondary"
                          onClick={() => loadLedgerEntries(selectedLedger.id, entriesPage - 1)}
                          disabled={entriesPage <= 0 || entriesLoading}
                        >
                          Prev
                        </button>
                        <button
                          className="btn-secondary"
                          onClick={() => loadLedgerEntries(selectedLedger.id, entriesPage + 1)}
                          disabled={entriesPage + 1 >= entriesTotalPages || entriesLoading}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p>No entries for this ledger</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Post Transaction Tab */}
      {activeTab === 'transaction' && (
        <div className="transaction-tab">
          <div className="form-container">
            <h3>Post Transaction to Category Ledger</h3>

            <div className="form-section">
              <label>Select Ledger</label>
              <select
                value={selectedLedger?.id || ''}
                onChange={(e) => {
                  const ledger = ledgers.find((l) => l.id === parseInt(e.target.value));
                  setSelectedLedger(ledger);
                }}
              >
                <option value="">-- Select a ledger --</option>
                {ledgers.map((ledger) => (
                  <option key={ledger.id} value={ledger.id}>
                    {ledger.categoryName} ({ledger.categoryType})
                  </option>
                ))}
              </select>
            </div>

            <form onSubmit={handlePostTransaction} className="transaction-form">
              <div className="form-row">
                <div className="form-section">
                  <label>Transaction Type</label>
                  <select
                    value={transactionForm.type}
                    onChange={(e) =>
                      setTransactionForm({ ...transactionForm, type: e.target.value })
                    }
                  >
                    <option value="credit">Money In (+)</option>
                    <option value="debit">Money Out (-)</option>
                    <option value="transfer">Transfer</option>
                  </select>
                </div>

                <div className="form-section">
                  <label>Amount (KES)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={transactionForm.amount}
                    onChange={(e) =>
                      setTransactionForm({ ...transactionForm, amount: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="form-section">
                <label>Description</label>
                <input
                  type="text"
                  placeholder="Transaction description"
                  value={transactionForm.description}
                  onChange={(e) =>
                    setTransactionForm({ ...transactionForm, description: e.target.value })
                  }
                />
              </div>

              <div className="form-row">
                <div className="form-section">
                  <label>Source Type</label>
                  <input
                    type="text"
                    placeholder="e.g., deposit, withdrawal, manual"
                    value={transactionForm.sourceType}
                    onChange={(e) =>
                      setTransactionForm({ ...transactionForm, sourceType: e.target.value })
                    }
                  />
                </div>

                <div className="form-section">
                  <label>Reference</label>
                  <input
                    type="text"
                    placeholder="Reference number"
                    value={transactionForm.reference}
                    onChange={(e) =>
                      setTransactionForm({ ...transactionForm, reference: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="form-section">
                <label>Narration</label>
                <textarea
                  placeholder="Additional notes"
                  value={transactionForm.narration}
                  onChange={(e) =>
                    setTransactionForm({ ...transactionForm, narration: e.target.value })
                  }
                  rows="3"
                />
              </div>

              <button type="submit" className="btn-primary">
                Post Transaction
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Tab */}
      {activeTab === 'transfer' && (
        <div className="transfer-tab">
          <div className="form-container">
            <h3>Transfer Between Category Ledgers</h3>

            <form onSubmit={handleTransfer} className="transfer-form">
              <div className="form-row">
                <div className="form-section">
                  <label>From Category</label>
                  <select
                    value={transferForm.fromCategoryLedgerId}
                    onChange={(e) =>
                      setTransferForm({
                        ...transferForm,
                        fromCategoryLedgerId: e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">-- Select source --</option>
                    {ledgers.map((ledger) => (
                      <option key={ledger.id} value={ledger.id}>
                        {ledger.categoryName} (Balance: KES{parseFloat(ledger.balance).toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-section">
                  <label>To Category</label>
                  <select
                    value={transferForm.toCategoryLedgerId}
                    onChange={(e) =>
                      setTransferForm({
                        ...transferForm,
                        toCategoryLedgerId: e.target.value,
                      })
                    }
                    required
                  >
                    <option value="">-- Select destination --</option>
                    {ledgers.map((ledger) => (
                      <option key={ledger.id} value={ledger.id}>
                        {ledger.categoryName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-section">
                  <label>Amount (KES)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={transferForm.amount}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, amount: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-section">
                  <label>Reference</label>
                  <input
                    type="text"
                    placeholder="Transfer reference"
                    value={transferForm.reference}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, reference: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="form-section">
                <label>Description</label>
                <textarea
                  placeholder="Reason for transfer"
                  value={transferForm.description}
                  onChange={(e) =>
                    setTransferForm({ ...transferForm, description: e.target.value })
                  }
                  rows="3"
                />
              </div>

              <button type="submit" className="btn-primary">
                Complete Transfer
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryLedgerPage;

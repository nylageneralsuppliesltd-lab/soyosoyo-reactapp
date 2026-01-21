import React, { useState, useEffect } from 'react';
import assetsAPI from '../utils/assetsAPI';
import { getAccounts } from '../utils/dashboardAPI';
import '../styles/assets.css';

const AssetsPage = () => {
  const [assets, setAssets] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');

  // Purchase form state
  const [purchaseForm, setPurchaseForm] = useState({
    name: '',
    description: '',
    category: 'Equipment',
    purchasePrice: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    purchaseAccountId: '',
    depreciationRate: '',
  });

  // Sale form state
  const [saleForm, setSaleForm] = useState({
    disposalPrice: '',
    disposalDate: new Date().toISOString().slice(0, 10),
    disposalAccountId: '',
    disposalReason: '',
  });

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assetsData, accountsData, summaryData] = await Promise.all([
        assetsAPI.getAllAssets(statusFilter === 'all' ? null : statusFilter),
        getAccounts(),
        assetsAPI.getAssetsSummary(),
      ]);

      setAssets(assetsData || []);
      setAccounts(accountsData || []);
      setSummary(summaryData);
    } catch (error) {
      console.error('Failed to load data:', error);
      alert('Error loading assets data');
    } finally {
      setLoading(false);
    }
  };

  const handlePurchaseAsset = async (e) => {
    e.preventDefault();
    if (!purchaseForm.name || !purchaseForm.purchasePrice || !purchaseForm.purchaseAccountId) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      await assetsAPI.purchaseAsset({
        name: purchaseForm.name,
        description: purchaseForm.description,
        category: purchaseForm.category,
        purchasePrice: parseFloat(purchaseForm.purchasePrice),
        purchaseDate: purchaseForm.purchaseDate,
        purchaseAccountId: parseInt(purchaseForm.purchaseAccountId),
        depreciationRate: purchaseForm.depreciationRate
          ? parseFloat(purchaseForm.depreciationRate)
          : undefined,
      });

      alert('Asset purchased successfully');
      setPurchaseForm({
        name: '',
        description: '',
        category: 'Equipment',
        purchasePrice: '',
        purchaseDate: new Date().toISOString().slice(0, 10),
        purchaseAccountId: '',
        depreciationRate: '',
      });

      loadData();
      setActiveTab('list');
    } catch (error) {
      console.error('Failed to purchase asset:', error);
      alert(`Error: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleSellAsset = async (e) => {
    e.preventDefault();
    if (!selectedAsset || !saleForm.disposalPrice || !saleForm.disposalAccountId) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      await assetsAPI.sellAsset(selectedAsset.id, {
        disposalPrice: parseFloat(saleForm.disposalPrice),
        disposalDate: saleForm.disposalDate,
        disposalAccountId: parseInt(saleForm.disposalAccountId),
        disposalReason: saleForm.disposalReason,
      });

      alert('Asset sold successfully');
      setSaleForm({
        disposalPrice: '',
        disposalDate: new Date().toISOString().slice(0, 10),
        disposalAccountId: '',
        disposalReason: '',
      });

      loadData();
      setSelectedAsset(null);
      setActiveTab('list');
    } catch (error) {
      console.error('Failed to sell asset:', error);
      alert(`Error: ${error.response?.data?.message || error.message}`);
    }
  };

  const getAccountLabel = (accountId) => {
    const account = accounts.find((a) => a.id === accountId);
    return account ? `${account.name} (${account.type})` : `Account ${accountId}`;
  };

  return (
    <div className="assets-page">
      <div className="assets-header">
        <h2>Asset Management</h2>
        <p>Buy and sell SACCO assets with account tracking</p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="summary-cards">
          <div className="summary-card">
            <h4>Total Assets</h4>
            <p className="amount">{summary.totalAssets}</p>
            <span className="detail">{summary.activeAssets} active</span>
          </div>
          <div className="summary-card">
            <h4>Purchase Value</h4>
            <p className="amount">KES {summary.totalPurchaseValue.toLocaleString()}</p>
          </div>
          <div className="summary-card">
            <h4>Current Value</h4>
            <p className="amount">KES {summary.totalCurrentValue.toLocaleString()}</p>
          </div>
          <div className="summary-card">
            <h4>Total Depreciation</h4>
            <p className="amount">
              KES {(summary.totalPurchaseValue - summary.totalCurrentValue).toLocaleString()}
            </p>
          </div>
          <div className={`summary-card ${summary.totalGainLoss >= 0 ? 'gain' : 'loss'}`}>
            <h4>Gain/Loss from Sales</h4>
            <p className="amount">KES {summary.totalGainLoss.toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          Assets List
        </button>
        <button
          className={`tab ${activeTab === 'purchase' ? 'active' : ''}`}
          onClick={() => setActiveTab('purchase')}
        >
          Buy Asset
        </button>
        <button
          className={`tab ${activeTab === 'sell' ? 'active' : ''}`}
          onClick={() => setActiveTab('sell')}
          disabled={!selectedAsset}
        >
          Sell Asset
        </button>
        <button
          className={`tab ${activeTab === 'depreciation' ? 'active' : ''}`}
          onClick={() => setActiveTab('depreciation')}
        >
          Depreciation Report
        </button>
      </div>

      {/* Assets List Tab */}
      {activeTab === 'list' && (
        <div className="assets-list-tab">
          <div className="filter-buttons">
            <button
              className={`filter-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All Assets
            </button>
            <button
              className={`filter-btn ${statusFilter === 'active' ? 'active' : ''}`}
              onClick={() => setStatusFilter('active')}
            >
              Active
            </button>
            <button
              className={`filter-btn ${statusFilter === 'sold' ? 'active' : ''}`}
              onClick={() => setStatusFilter('sold')}
            >
              Sold
            </button>
          </div>

          {loading ? (
            <p>Loading assets...</p>
          ) : assets.length > 0 ? (
            <div className="assets-table-container">
              <table className="assets-table">
                <thead>
                  <tr>
                    <th>Asset Name</th>
                    <th>Category</th>
                    <th>Purchase Price</th>
                    <th>Current Value</th>
                    <th>Depreciation</th>
                    <th>Purchase Date</th>
                    <th>Account</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((asset) => {
                    const depreciation =
                      Number(asset.purchasePrice) - Number(asset.currentValue);
                    const depreciationPercent =
                      ((depreciation / Number(asset.purchasePrice)) * 100).toFixed(1);

                    return (
                      <tr key={asset.id}>
                        <td>
                          <strong>{asset.name}</strong>
                          {asset.description && (
                            <div className="description">{asset.description}</div>
                          )}
                        </td>
                        <td>{asset.category}</td>
                        <td className="amount">
                          KES {Number(asset.purchasePrice).toLocaleString()}
                        </td>
                        <td className="amount">
                          KES {Number(asset.currentValue).toLocaleString()}
                        </td>
                        <td className="depreciation">
                          KES {depreciation.toLocaleString()} ({depreciationPercent}%)
                        </td>
                        <td>{new Date(asset.purchaseDate).toLocaleDateString()}</td>
                        <td>{asset.purchaseAccount ? asset.purchaseAccount.name : 'N/A'}</td>
                        <td>
                          <span className={`badge ${asset.status}`}>{asset.status}</span>
                        </td>
                        <td>
                          <button
                            className="btn-select"
                            onClick={() => {
                              setSelectedAsset(asset);
                              setActiveTab('sell');
                            }}
                            disabled={asset.status !== 'active'}
                          >
                            Sell
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="no-data">No assets found. Click "Buy Asset" to create one.</p>
          )}
        </div>
      )}

      {/* Purchase Asset Tab */}
      {activeTab === 'purchase' && (
        <div className="purchase-tab">
          <div className="form-container">
            <h3>Purchase New Asset</h3>

            <form onSubmit={handlePurchaseAsset} className="asset-form">
              <div className="form-row">
                <div className="form-section">
                  <label>Asset Name *</label>
                  <input
                    type="text"
                    placeholder="e.g., Office Equipment, Vehicle"
                    value={purchaseForm.name}
                    onChange={(e) =>
                      setPurchaseForm({ ...purchaseForm, name: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-section">
                  <label>Category *</label>
                  <select
                    value={purchaseForm.category}
                    onChange={(e) =>
                      setPurchaseForm({ ...purchaseForm, category: e.target.value })
                    }
                  >
                    <option value="Equipment">Equipment</option>
                    <option value="Vehicle">Vehicle</option>
                    <option value="Building">Building</option>
                    <option value="Furniture">Furniture</option>
                    <option value="Technology">Technology</option>
                    <option value="Land">Land</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="form-section">
                <label>Description</label>
                <textarea
                  placeholder="Asset details..."
                  value={purchaseForm.description}
                  onChange={(e) =>
                    setPurchaseForm({ ...purchaseForm, description: e.target.value })
                  }
                  rows="3"
                />
              </div>

              <div className="form-row">
                <div className="form-section">
                  <label>Purchase Price (KES) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={purchaseForm.purchasePrice}
                    onChange={(e) =>
                      setPurchaseForm({ ...purchaseForm, purchasePrice: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="form-section">
                  <label>Purchase Date *</label>
                  <input
                    type="date"
                    value={purchaseForm.purchaseDate}
                    onChange={(e) =>
                      setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-section">
                  <label>Payment Account (Cash/MPESA/Bank) *</label>
                  <select
                    value={purchaseForm.purchaseAccountId}
                    onChange={(e) =>
                      setPurchaseForm({ ...purchaseForm, purchaseAccountId: e.target.value })
                    }
                    required
                  >
                    <option value="">-- Select Account --</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name} ({account.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-section">
                  <label>Annual Depreciation Rate (%) (Optional)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder="e.g., 10"
                    value={purchaseForm.depreciationRate}
                    onChange={(e) =>
                      setPurchaseForm({ ...purchaseForm, depreciationRate: e.target.value })
                    }
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary">
                Record Asset Purchase
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Sell Asset Tab */}
      {activeTab === 'sell' && selectedAsset && (
        <div className="sell-tab">
          <div className="form-container">
            <h3>Sell Asset: {selectedAsset.name}</h3>

            <div className="asset-info">
              <div className="info-row">
                <span>Category:</span>
                <strong>{selectedAsset.category}</strong>
              </div>
              <div className="info-row">
                <span>Purchase Price:</span>
                <strong>KES {Number(selectedAsset.purchasePrice).toLocaleString()}</strong>
              </div>
              <div className="info-row">
                <span>Current Value:</span>
                <strong>KES {Number(selectedAsset.currentValue).toLocaleString()}</strong>
              </div>
              <div className="info-row">
                <span>Depreciation:</span>
                <strong>
                  KES{' '}
                  {(
                    Number(selectedAsset.purchasePrice) - Number(selectedAsset.currentValue)
                  ).toLocaleString()}
                </strong>
              </div>
            </div>

            <form onSubmit={handleSellAsset} className="asset-form">
              <div className="form-row">
                <div className="form-section">
                  <label>Disposal Price (KES) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={saleForm.disposalPrice}
                    onChange={(e) => setSaleForm({ ...saleForm, disposalPrice: e.target.value })}
                    required
                  />
                </div>

                <div className="form-section">
                  <label>Disposal Date *</label>
                  <input
                    type="date"
                    value={saleForm.disposalDate}
                    onChange={(e) => setSaleForm({ ...saleForm, disposalDate: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-section">
                <label>Receive Funds in Account (Cash/MPESA/Bank) *</label>
                <select
                  value={saleForm.disposalAccountId}
                  onChange={(e) =>
                    setSaleForm({ ...saleForm, disposalAccountId: e.target.value })
                  }
                  required
                >
                  <option value="">-- Select Account --</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({account.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-section">
                <label>Reason for Disposal</label>
                <textarea
                  placeholder="e.g., End of useful life, Sold for upgrade, Damaged"
                  value={saleForm.disposalReason}
                  onChange={(e) => setSaleForm({ ...saleForm, disposalReason: e.target.value })}
                  rows="3"
                />
              </div>

              {saleForm.disposalPrice && (
                <div className="gain-loss-preview">
                  <div className={Number(saleForm.disposalPrice) >= Number(selectedAsset.currentValue) ? 'gain' : 'loss'}>
                    <span>Expected Gain/Loss:</span>
                    <strong>
                      KES{' '}
                      {(
                        Number(saleForm.disposalPrice) - Number(selectedAsset.currentValue)
                      ).toLocaleString()}
                    </strong>
                  </div>
                </div>
              )}

              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  Complete Asset Sale
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setSelectedAsset(null);
                    setSaleForm({
                      disposalPrice: '',
                      disposalDate: new Date().toISOString().slice(0, 10),
                      disposalAccountId: '',
                      disposalReason: '',
                    });
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Depreciation Report Tab */}
      {activeTab === 'depreciation' && (
        <div className="depreciation-tab">
          <h3>Asset Depreciation Report</h3>
          {summary && Object.keys(summary.byCategory).length > 0 ? (
            <div className="depreciation-summary">
              {Object.entries(summary.byCategory).map(([category, data]) => (
                <div key={category} className="category-depreciation">
                  <h4>{category}</h4>
                  <div className="depreciation-details">
                    <div className="detail-item">
                      <span>Assets:</span>
                      <strong>{data.count}</strong>
                    </div>
                    <div className="detail-item">
                      <span>Total Purchase Value:</span>
                      <strong>KES {data.purchaseValue.toLocaleString()}</strong>
                    </div>
                    <div className="detail-item">
                      <span>Current Value:</span>
                      <strong>KES {data.currentValue.toLocaleString()}</strong>
                    </div>
                    <div className="detail-item depreciation-item">
                      <span>Depreciation:</span>
                      <strong>
                        KES {(data.purchaseValue - data.currentValue).toLocaleString()}
                      </strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>No depreciation data available.</p>
          )}
        </div>
      )}
    </div>
  );
};

export default AssetsPage;

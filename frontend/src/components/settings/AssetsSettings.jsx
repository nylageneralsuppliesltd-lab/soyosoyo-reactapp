import React, { useEffect, useState } from 'react';
import { getAssets, createAsset, updateAsset, deleteAsset } from '../../utils/settingsAPI';

const defaultAsset = {
  name: '',
  description: '',
  category: '',
  purchaseDate: '',
  purchasePrice: '',
  currentValue: '',
  location: '',
  serialNumber: '',
  condition: 'Good',
  notes: '',
  isActive: true,
};

const AssetsSettings = () => {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expandedRow, setExpandedRow] = useState({ tab: null, id: null });
  const [formData, setFormData] = useState(defaultAsset);

  useEffect(() => {
    loadAssets();
  }, []);

  const formatCurrency = (value) => {
    return Number(value || 0).toLocaleString('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-KE');
  };

  const formatAssetSummary = (asset) => {
    const parts = [
      asset.category || 'Uncategorized',
      formatCurrency(asset.purchasePrice),
      asset.condition || 'Good',
    ];
    return parts.filter(Boolean).join(' | ');
  };

  const isRowExpanded = (tab, id) => expandedRow?.tab === tab && expandedRow?.id === id;

  const loadAssets = async () => {
    try {
      setLoading(true);
      const data = await getAssets();
      setAssets(data);
    } catch (err) {
      console.error(err);
      alert('Failed to load assets');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        purchasePrice: formData.purchasePrice ? parseFloat(formData.purchasePrice) : null,
        currentValue: formData.currentValue ? parseFloat(formData.currentValue) : null,
        purchaseDate: formData.purchaseDate || null,
      };
      if (editing) {
        await updateAsset(editing.id, payload);
        alert('Asset updated');
      } else {
        await createAsset(payload);
        alert('Asset created');
      }
      resetForm();
      loadAssets();
    } catch (err) {
      console.error(err);
      alert('Failed to save asset');
    }
  };

  const resetForm = () => {
    setFormData(defaultAsset);
    setEditing(null);
    setShowForm(false);
    setExpandedRow({ tab: null, id: null });
  };

  const startEdit = (asset) => {
    setEditing(asset);
    setFormData({
      ...asset,
      purchaseDate: asset.purchaseDate ? asset.purchaseDate.substring(0, 10) : '',
      purchasePrice: asset.purchasePrice ?? '',
      currentValue: asset.currentValue ?? '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this asset?')) return;
    try {
      await deleteAsset(id);
      alert('Asset deleted');
      loadAssets();
    } catch (err) {
      console.error(err);
      alert('Failed to delete asset');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 5px 0' }}>Assets</h3>
          <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>Track equipment, vehicles, properties, etc.</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
          className="btn-add"
        >
          {showForm ? '✕ Close' : '+ Add Asset'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '20px' }}>
          <h3>{editing ? 'Edit Asset' : 'New Asset'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div>
                <label>Asset Name *</label>
                <input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Office Laptop"
                />
              </div>

              <div>
                <label>Category</label>
                <input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Equipment, Vehicle, Building"
                />
              </div>

              <div>
                <label>Purchase Date</label>
                <input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                />
              </div>

              <div>
                <label>Purchase Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                  placeholder="e.g., 120000"
                />
              </div>

              <div>
                <label>Current Value</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.currentValue}
                  onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })}
                  placeholder="e.g., 95000"
                />
              </div>

              <div>
                <label>Location</label>
                <input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Nairobi HQ"
                />
              </div>

              <div>
                <label>Serial / Reference</label>
                <input
                  value={formData.serialNumber}
                  onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                  placeholder="e.g., SN-123456"
                />
              </div>

              <div>
                <label>Condition</label>
                <select
                  value={formData.condition}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                >
                  <option>Excellent</option>
                  <option>Good</option>
                  <option>Fair</option>
                  <option>Poor</option>
                </select>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label>Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="2"
                  placeholder="Maintenance history or comments"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="asset-active"
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <label htmlFor="asset-active">Asset is active</label>
              </div>
            </div>

            <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn-primary">
                {editing ? 'Update Asset' : 'Create Asset'}
              </button>
              <button type="button" onClick={resetForm} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>Loading assets...</div>
      ) : assets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>No assets added yet.</div>
      ) : (
        <div className="card">
          <div className="table-responsive">
            <table className="config-table">
              <thead>
                <tr>
                  <th>Asset Name</th>
                  <th>Summary</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <React.Fragment key={asset.id}>
                    <tr>
                      <td><strong>{asset.name}</strong></td>
                      <td>{formatAssetSummary(asset)}</td>
                      <td><span className="status-badge">{asset.isActive ? '✓ Active' : 'Inactive'}</span></td>
                      <td>
                        <button
                          className="btn-edit"
                          onClick={() => setExpandedRow({ tab: 'assets', id: asset.id })}
                        >
                          View
                        </button>
                        <button className="btn-edit" onClick={() => startEdit(asset)}>
                          Edit
                        </button>
                        <button
                          className="btn-edit"
                          onClick={() => setExpandedRow({ tab: null, id: null })}
                          disabled={!isRowExpanded('assets', asset.id)}
                        >
                          Cancel
                        </button>
                        <button className="btn-delete" onClick={() => handleDelete(asset.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                    {isRowExpanded('assets', asset.id) && (
                      <tr>
                        <td colSpan={4}>
                          <div className="config-details">
                            <div className="config-details-grid">
                              <div className="config-detail-item">
                                <span className="config-detail-label">Category</span>
                                <div className="config-detail-value">{asset.category || '-'}</div>
                              </div>
                              <div className="config-detail-item">
                                <span className="config-detail-label">Purchase Date</span>
                                <div className="config-detail-value">{formatDate(asset.purchaseDate)}</div>
                              </div>
                              <div className="config-detail-item">
                                <span className="config-detail-label">Purchase Price</span>
                                <div className="config-detail-value" style={{ fontSize: '16px', fontWeight: 'bold', color: '#2980b9' }}>
                                  {formatCurrency(asset.purchasePrice)}
                                </div>
                              </div>
                              <div className="config-detail-item">
                                <span className="config-detail-label">Current Value</span>
                                <div className="config-detail-value" style={{ fontSize: '16px', fontWeight: 'bold', color: '#27ae60' }}>
                                  {formatCurrency(asset.currentValue)}
                                </div>
                              </div>
                              <div className="config-detail-item">
                                <span className="config-detail-label">Location</span>
                                <div className="config-detail-value">{asset.location || '-'}</div>
                              </div>
                              <div className="config-detail-item">
                                <span className="config-detail-label">Serial / Reference</span>
                                <div className="config-detail-value">{asset.serialNumber || '-'}</div>
                              </div>
                              <div className="config-detail-item">
                                <span className="config-detail-label">Condition</span>
                                <div className="config-detail-value">{asset.condition || 'Good'}</div>
                              </div>
                              {asset.description && (
                                <div className="config-detail-item" style={{ gridColumn: '1 / -1' }}>
                                  <span className="config-detail-label">Description</span>
                                  <div className="config-detail-value">{asset.description}</div>
                                </div>
                              )}
                              {asset.notes && (
                                <div className="config-detail-item" style={{ gridColumn: '1 / -1' }}>
                                  <span className="config-detail-label">Notes</span>
                                  <div className="config-detail-value">{asset.notes}</div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetsSettings;

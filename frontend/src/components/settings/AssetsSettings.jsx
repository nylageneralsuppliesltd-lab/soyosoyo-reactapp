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
  const [formData, setFormData] = useState(defaultAsset);

  useEffect(() => {
    loadAssets();
  }, []);

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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">Assets</h3>
          <p className="text-sm text-gray-600">Track SACCO assets: equipment, vehicles, properties, etc.</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <span className="text-lg">+</span>
          <span>{showForm ? 'Close' : 'Add Asset'}</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Asset Name *</label>
            <input
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Office Laptop Dell XPS"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              placeholder="Equipment, Vehicle, Building"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
            <input
              type="date"
              value={formData.purchaseDate}
              onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price</label>
            <input
              type="number"
              step="0.01"
              value={formData.purchasePrice}
              onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 120000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Value</label>
            <input
              type="number"
              step="0.01"
              value={formData.currentValue}
              onChange={(e) => setFormData({ ...formData, currentValue: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 95000"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Nairobi HQ"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Serial / Reference</label>
            <input
              value={formData.serialNumber}
              onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., SN-123456"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
            <select
              value={formData.condition}
              onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option>Excellent</option>
              <option>Good</option>
              <option>Fair</option>
              <option>Poor</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              rows={2}
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
            <label htmlFor="asset-active" className="text-sm text-gray-700">Asset is active</label>
          </div>

          <div className="flex gap-2 md:col-span-2">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              {editing ? 'Update Asset' : 'Create Asset'}
            </button>
            <button type="button" onClick={resetForm} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-8">Loading assets...</div>
      ) : assets.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No assets added yet. Start by adding your first asset.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <div key={asset.id} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="font-semibold text-gray-800">{asset.name}</h4>
                  <p className="text-xs text-gray-500">{asset.category || 'Uncategorized'}</p>
                </div>
                <span className={`px-2 py-1 text-xs rounded ${asset.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {asset.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="text-sm text-gray-700 space-y-1 mb-3">
                {asset.purchasePrice && <p>Cost: KES {parseFloat(asset.purchasePrice).toLocaleString()}</p>}
                {asset.currentValue && <p>Value: KES {parseFloat(asset.currentValue).toLocaleString()}</p>}
                {asset.purchaseDate && <p>Purchased: {new Date(asset.purchaseDate).toLocaleDateString()}</p>}
                {asset.location && <p>📍 {asset.location}</p>}
                {asset.serialNumber && <p>🔖 {asset.serialNumber}</p>}
                {asset.condition && <p>🛠️ Condition: {asset.condition}</p>}
              </div>

              {asset.notes && <p className="text-sm text-gray-600 mb-3">{asset.notes}</p>}

              <div className="flex gap-2">
                <button onClick={() => startEdit(asset)} className="flex-1 bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 text-sm">Edit</button>
                <button onClick={() => handleDelete(asset.id)} className="flex-1 bg-red-50 text-red-600 px-3 py-1 rounded hover:bg-red-100 text-sm">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AssetsSettings;

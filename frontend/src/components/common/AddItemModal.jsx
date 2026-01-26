import React, { useState } from 'react';
import { X, Plus, AlertCircle, Loader } from 'lucide-react';
import '../../styles/addItemModal.css';

/**
 * Modal for quickly adding new items (categories, accounts, etc.)
 * 
 * Props:
 * - isOpen: Whether modal is visible
 * - onClose: Close handler
 * - title: Modal title
 * - itemType: Type of item being added (for API endpoint)
 * - onSuccess: Called after successful addition
 * - fields: Array of field definitions
 */
const AddItemModal = ({
  isOpen,
  onClose,
  title = 'Add New Item',
  itemType = '',
  onSuccess,
  fields = [],
  apiEndpoint = '',
}) => {
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validate required fields
      const missingFields = fields
        .filter(f => f.required)
        .filter(f => !formData[f.name])
        .map(f => f.label);

      if (missingFields.length > 0) {
        setError(`Please fill in: ${missingFields.join(', ')}`);
        setLoading(false);
        return;
      }

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to add item');
      }

      const newItem = await response.json();
      
      // Call success callback with new item
      if (onSuccess) {
        onSuccess(newItem);
        if (onCancel) onCancel();
      }

      // Reset and close
      setFormData({});
      onClose();
    } catch (err) {
      setError(err.message || 'Error adding item');
      console.error('Error adding item:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-item-modal-overlay" onClick={onClose}>
      <div className="add-item-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="add-item-modal-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="add-item-modal-close"
            onClick={onClose}
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="add-item-modal-form">
          {/* Error Message */}
          {error && (
            <div className="add-item-modal-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Form Fields */}
          <div className="add-item-modal-fields">
            {fields.map((field) => (
              <div key={field.name} className="add-item-modal-field">
                <label htmlFor={field.name} className="add-item-modal-label">
                  {field.label}
                  {field.required && <span className="required">*</span>}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    id={field.name}
                    name={field.name}
                    value={formData[field.name] || ''}
                    onChange={handleChange}
                    placeholder={field.placeholder}
                    rows={3}
                    disabled={loading}
                  />
                ) : field.type === 'select' ? (
                  <select
                    id={field.name}
                    name={field.name}
                    value={formData[field.name] || ''}
                    onChange={handleChange}
                    disabled={loading}
                  >
                    <option value="">Select {field.label.toLowerCase()}</option>
                    {field.options?.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type || 'text'}
                    id={field.name}
                    name={field.name}
                    value={formData[field.name] || ''}
                    onChange={handleChange}
                    placeholder={field.placeholder}
                    disabled={loading}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Footer with Actions */}
          <div className="add-item-modal-footer">
            <button
              type="button"
              className="add-item-modal-btn cancel"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="add-item-modal-btn submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader size={16} className="spinning" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Add {title.replace('Add ', '').replace('Add New ', '')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddItemModal;

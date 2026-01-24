import React, { useState } from 'react';
import { Plus, AlertCircle, ChevronDown } from 'lucide-react';
import '../../styles/smartSelect.css';

/**
 * SmartSelect Component
 * 
 * A dropdown that shows an "Add New" button when the list is empty or to quickly add items
 * 
 * Props:
 * - label: Display label for the select
 * - name: Input name attribute
 * - value: Current selected value
 * - onChange: Change handler
 * - options: Array of {id, name} objects
 * - onAddNew: Callback when "Add New" is clicked - receives the type
 * - addButtonText: Text for the add button (e.g., "Add Bank Account")
 * - placeholder: Placeholder text
 * - required: Is field required
 * - isLoading: Show loading state
 * - showAddButton: Whether to show add button (default: true)
 * - addButtonType: Type identifier for the add action (e.g., 'bank_account', 'expense_category')
 */
const SmartSelect = ({
  label,
  name,
  value,
  onChange,
  options = [],
  onAddNew,
  addButtonText = 'Add New',
  placeholder = 'Select an option...',
  required = false,
  isLoading = false,
  showAddButton = true,
  addButtonType = '',
  icon: Icon = null,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOptions = options.filter(opt =>
    opt.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    opt.label?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedOption = options.find(opt => opt.id === parseInt(value) || opt.id === value);

  const handleAddClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);
    setSearchTerm('');
    if (onAddNew) {
      onAddNew(addButtonType);
    }
  };

  const handleSelectOption = (option) => {
    onChange({ target: { name, value: option.id } });
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="smart-select-wrapper">
      {label && (
        <label htmlFor={name} className="smart-select-label">
          {label}
          {required && <span className="required">*</span>}
        </label>
      )}

      <div className="smart-select-container">
        {/* Main Select Button */}
        <button
          type="button"
          className={`smart-select-button ${isOpen ? 'open' : ''} ${isLoading ? 'loading' : ''}`}
          onClick={() => !isLoading && setIsOpen(!isOpen)}
          disabled={isLoading}
        >
          <div className="smart-select-button-content">
            {Icon && <Icon size={16} className="select-icon" />}
            <span className={`select-text ${!selectedOption ? 'placeholder' : ''}`}>
              {isLoading ? 'Loading...' : (selectedOption?.name || selectedOption?.label || placeholder)}
            </span>
          </div>
          <ChevronDown
            size={16}
            className={`select-chevron ${isOpen ? 'rotated' : ''}`}
          />
        </button>

        {/* Dropdown Menu */}
        {isOpen && !isLoading && (
          <div className="smart-select-dropdown">
            {/* Search Input */}
            <input
              type="text"
              className="smart-select-search"
              placeholder="Search or create..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />

            {/* Options List */}
            <div className="smart-select-options">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`smart-select-option ${
                      selectedOption?.id === option.id ? 'selected' : ''
                    }`}
                    onClick={() => handleSelectOption(option)}
                  >
                    {option.name || option.label}
                  </button>
                ))
              ) : options.length > 0 && searchTerm ? (
                <div className="smart-select-no-match">
                  <AlertCircle size={16} />
                  <span>No matches found</span>
                </div>
              ) : options.length === 0 ? (
                <div className="smart-select-empty">
                  <AlertCircle size={16} />
                  <span>No options available</span>
                </div>
              ) : null}
            </div>

            {/* Add New Button */}
            {showAddButton && (
              <button
                type="button"
                className="smart-select-add-button"
                onClick={handleAddClick}
              >
                <Plus size={16} />
                {addButtonText}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Empty State Message */}
      {!isOpen && options.length === 0 && showAddButton && (
        <div className="smart-select-empty-hint">
          <button
            type="button"
            className="smart-select-quick-add"
            onClick={handleAddClick}
          >
            <Plus size={14} />
            {addButtonText}
          </button>
        </div>
      )}
    </div>
  );
};

export default SmartSelect;

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

const MemberPicker = ({
  label = 'Member',
  members = [],
  value = '',
  onChange,
  onSelect,
  onAddNew,
  required = false,
  placeholder = 'Search by name, phone, or member number',
  showBalance = false,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);

  const filteredMembers = useMemo(() => {
    const term = String(value || '').trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) => {
      const name = String(member.name || '').toLowerCase();
      const phone = String(member.phone || '');
      const idNumber = String(member.idNumber || '');
      return name.includes(term) || phone.includes(term) || idNumber.includes(term);
    });
  }, [members, value]);

  const handleChange = (event) => {
    onChange?.(event.target.value);
    setShowDropdown(true);
  };

  const handleSelect = (member) => {
    onSelect?.(member);
    setShowDropdown(false);
  };

  return (
    <div className="form-group member-search-group">
      <label>
        <Search size={18} />
        {label} {required && '*'}
      </label>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => setShowDropdown(true)}
        placeholder={placeholder}
        required={required}
      />
      {showDropdown && (
        <div className="member-dropdown">
          {filteredMembers.length > 0 && filteredMembers.slice(0, 10).map((member) => (
            <button
              key={member.id}
              type="button"
              className="member-option"
              onClick={(event) => {
                event.preventDefault();
                handleSelect(member);
              }}
            >
              <div className="member-info">
                <span className="member-name">{member.name}</span>
                <span className="member-number">{member.idNumber || 'N/A'}</span>
              </div>
              <div className="member-details">
                <span className="member-phone">{member.phone || ''}</span>
                {showBalance && (
                  <span className="balance">
                    Balance: KES {member.balance?.toFixed?.(2) || '0.00'}
                  </span>
                )}
              </div>
            </button>
          ))}
          <button
            type="button"
            className="member-option add-member-option"
            onClick={(event) => {
              event.preventDefault();
              onAddNew?.();
            }}
          >
            <div className="member-info">
              <span className="member-name">+ Add New Member</span>
            </div>
            <div className="member-details">
              <span className="member-phone">Register a new member</span>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default MemberPicker;

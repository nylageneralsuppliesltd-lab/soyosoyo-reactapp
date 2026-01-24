import React, { useState } from 'react';

export default function NomineeInputs({ nominees, setNominees }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  const addNominee = () => {
    if (nominees.length >= 3) return alert('Maximum 3 nominees allowed');
    setNominees([...nominees, { name: '', relationship: '', id: '', phone: '', share: 0 }]);
  };

  const removeNominee = (index) => {
    setNominees(nominees.filter((_, i) => i !== index));
    if (expandedIndex === index) setExpandedIndex(null);
  };

  const updateNominee = (index, field, value) => {
    const updated = [...nominees];
    updated[index][field] = value;
    setNominees(updated);
  };

  const totalShare = nominees.reduce((sum, n) => sum + (n.share || 0), 0);

  return (
    <div className="nominees-container">
      {nominees.length === 0 ? (
        <p className="no-nominees">No nominees added yet. Click the button below to add.</p>
      ) : (
        <div className="nominees-list">
          {nominees.map((nok, idx) => (
            <div key={idx} className="nominee-card">
              <div className="nominee-header" onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)}>
                <div className="nominee-summary">
                  <span className="nominee-number">#{idx + 1}</span>
                  <div className="nominee-info">
                    <p className="nominee-name">{nok.name || '(No name)'}</p>
                    <p className="nominee-meta">{nok.relationship || 'No relationship'} • {nok.share || 0}%</p>
                  </div>
                </div>
                <button type="button" className="expand-btn" aria-expanded={expandedIndex === idx}>
                  {expandedIndex === idx ? '▼' : '▶'}
                </button>
              </div>

              {expandedIndex === idx && (
                <div className="nominee-content">
                  <div className="nominee-grid">
                    <div className="nominee-field">
                      <label>Full Name *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="E.g., Mary Wanjiru"
                        value={nok.name}
                        onChange={(e) => updateNominee(idx, 'name', e.target.value)}
                        required
                      />
                    </div>
                    <div className="nominee-field">
                      <label>Relationship *</label>
                      <select
                        className="form-input"
                        value={nok.relationship}
                        onChange={(e) => updateNominee(idx, 'relationship', e.target.value)}
                        required
                      >
                        <option value="">Select relationship</option>
                        <option value="Spouse">Spouse</option>
                        <option value="Child">Child</option>
                        <option value="Parent">Parent</option>
                        <option value="Sibling">Sibling</option>
                        <option value="Friend">Friend</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="nominee-field">
                      <label>ID Number *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="12345678"
                        value={nok.id}
                        onChange={(e) => updateNominee(idx, 'id', e.target.value)}
                        required
                      />
                    </div>
                    <div className="nominee-field">
                      <label>Phone Number *</label>
                      <input
                        type="tel"
                        className="form-input"
                        placeholder="0712345678"
                        value={nok.phone}
                        onChange={(e) => updateNominee(idx, 'phone', e.target.value)}
                        required
                      />
                    </div>
                    <div className="nominee-field">
                      <label>Share % *</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="25"
                        value={nok.share}
                        min={0}
                        max={100}
                        onChange={(e) => updateNominee(idx, 'share', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                    <div className="nominee-field field-action">
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => removeNominee(idx)}
                      >
                        🗑 Remove
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {nominees.length > 0 && (
        <div className="share-progress">
          <div className="progress-info">
            <span>Total Share: <strong>{totalShare}%</strong></span>
            <span className={`status ${totalShare === 100 ? 'valid' : 'invalid'}`}>
              {totalShare === 100 ? '✓ Valid' : `${100 - totalShare > 0 ? 'Need ' + (100 - totalShare) : 'Over ' + (totalShare - 100)}%`}
            </span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: Math.min(totalShare, 100) + '%' }}></div>
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn-add-nominee"
        onClick={addNominee}
        disabled={nominees.length >= 3}
      >
        + Add Nominee {nominees.length > 0 && `(${nominees.length}/3)`}
      </button>
    </div>
  );
}

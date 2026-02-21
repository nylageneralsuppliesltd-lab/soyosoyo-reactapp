// SaccoSettingsPage.jsx - Manage multiple SACCOs
import { useState } from 'react';
import { useSacco } from '../context/SaccoContext';
import { Plus, Trash, Check } from '@phosphor-icons/react';
import '../styles/sacco-settings.css';

export default function SaccoSettingsPage() {
  const { currentSacco, saccos, switchSacco, createSacco, updateSacco, deleteSacco, isSaccoExpired } = useSacco();
  const authSession = (() => {
    try {
      return JSON.parse(localStorage.getItem('authSession') || '{}');
    } catch {
      return {};
    }
  })();
  const developerOverride = Boolean(authSession?.user?.isSystemDeveloper && authSession?.user?.developerMode);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    slogan: '',
    registrationNumber: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    logo: '',
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateSacco = (e) => {
    e.preventDefault();
    if (formData.name && formData.email) {
      createSacco(formData);
      setFormData({
        name: '',
        slogan: '',
        registrationNumber: '',
        phone: '',
        email: '',
        website: '',
        address: '',
        logo: '',
      });
      setIsFormOpen(false);
    }
  };

  const handleUpdateSacco = (field, value) => {
    updateSacco({ [field]: value });
  };

  return (
    <div className="sacco-settings-container">
      {/* Header */}
      <div className="settings-header">
        <div>
          <h1>SACCO Management</h1>
          <p className="subtitle">Manage multiple SACCO organizations</p>
        </div>
        <button className="btn-primary" onClick={() => setIsFormOpen(!isFormOpen)}>
          <Plus size={20} /> Create New SACCO
        </button>
      </div>

      {/* Form */}
      {isFormOpen && (
        <div className="form-card">
          <h3>Create New SACCO</h3>
          <form onSubmit={handleCreateSacco}>
            <div className="form-row">
              <div className="form-group">
                <label>SACCO Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g., Soyosoyo SACCO"
                  required
                />
              </div>
              <div className="form-group">
                <label>Slogan</label>
                <input
                  type="text"
                  name="slogan"
                  value={formData.slogan}
                  onChange={handleInputChange}
                  placeholder="e.g., Empowering Your Financial Future"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Registration Number</label>
                <input
                  type="text"
                  name="registrationNumber"
                  value={formData.registrationNumber}
                  onChange={handleInputChange}
                  placeholder="REG/SACCO/YYYY/XXX"
                />
              </div>
              <div className="form-group">
                <label>Logo (2 letters)</label>
                <input
                  type="text"
                  name="logo"
                  value={formData.logo}
                  onChange={handleInputChange}
                  placeholder="SS"
                  maxLength="2"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Phone *</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="+254 (0) 700 123 456"
                  required
                />
              </div>
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="info@sacco.com"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Website</label>
                <input
                  type="url"
                  name="website"
                  value={formData.website}
                  onChange={handleInputChange}
                  placeholder="www.sacco.com"
                />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="P.O. Box, City, Country"
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">Create SACCO</button>
              <button type="button" className="btn-secondary" onClick={() => setIsFormOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SACCOs List */}
      <div className="saccos-grid">
        {saccos.map((sacco) => (
          (() => {
            const expired = isSaccoExpired(sacco);
            const hideDetails = expired && !developerOverride;

            return (
          <div
            key={sacco.id}
            className={`sacco-card ${currentSacco.id === sacco.id ? 'active' : ''}`}
          >
            <div className="sacco-header">
              <div className="sacco-logo">
                {sacco.logo || sacco.name.substring(0, 2).toUpperCase()}
              </div>
              <h3>{sacco.name}</h3>
            </div>

            <div className="sacco-details">
              {hideDetails ? (
                <>
                  <p><strong>Status:</strong> Hidden (Trial expired / non-payment)</p>
                  <p><strong>Trial Ended:</strong> {new Date(sacco.trialEndsAt).toLocaleDateString()}</p>
                </>
              ) : (
                <>
                  <p><strong>Slogan:</strong> {sacco.slogan || '-'}</p>
                  <p><strong>Registration:</strong> {sacco.registrationNumber || '-'}</p>
                  <p><strong>Phone:</strong> {sacco.phone}</p>
                  <p><strong>Email:</strong> {sacco.email}</p>
                  <p><strong>Website:</strong> {sacco.website || '-'}</p>
                  <p><strong>Address:</strong> {sacco.address || '-'}</p>
                  <p><strong>Trial Ends:</strong> {sacco.trialEndsAt ? new Date(sacco.trialEndsAt).toLocaleDateString() : '-'}</p>
                </>
              )}
            </div>

            <div className="sacco-actions">
              {currentSacco.id !== sacco.id && !hideDetails && (
                <button className="btn-switch" onClick={() => switchSacco(sacco.id)}>
                  <Check size={16} /> Switch to this SACCO
                </button>
              )}
              {hideDetails && (
                <button className="btn-danger" disabled>
                  Trial Expired - Payment Required
                </button>
              )}
              {currentSacco.id === sacco.id && (
                <button className="btn-active" disabled>
                  <Check size={16} /> Current SACCO
                </button>
              )}
              {saccos.length > 1 && currentSacco.id !== sacco.id && (
                <button className="btn-danger" onClick={() => deleteSacco(sacco.id)}>
                  <Trash size={16} /> Delete
                </button>
              )}
            </div>
          </div>
            );
          })()
        ))}
      </div>

      {/* Current SACCO Settings */}
      {currentSacco && (
        <div className="current-sacco-settings">
          <h2>Edit Current SACCO: {currentSacco.name}</h2>

          <div className="settings-grid">
            <div className="setting-item">
              <label>SACCO Name</label>
              <input
                type="text"
                value={currentSacco.name}
                onChange={(e) => handleUpdateSacco('name', e.target.value)}
              />
            </div>

            <div className="setting-item">
              <label>Slogan</label>
              <input
                type="text"
                value={currentSacco.slogan}
                onChange={(e) => handleUpdateSacco('slogan', e.target.value)}
              />
            </div>

            <div className="setting-item">
              <label>Phone</label>
              <input
                type="tel"
                value={currentSacco.phone}
                onChange={(e) => handleUpdateSacco('phone', e.target.value)}
              />
            </div>

            <div className="setting-item">
              <label>Email</label>
              <input
                type="email"
                value={currentSacco.email}
                onChange={(e) => handleUpdateSacco('email', e.target.value)}
              />
            </div>

            <div className="setting-item">
              <label>Website</label>
              <input
                type="url"
                value={currentSacco.website}
                onChange={(e) => handleUpdateSacco('website', e.target.value)}
              />
            </div>

            <div className="setting-item">
              <label>Address</label>
              <input
                type="text"
                value={currentSacco.address}
                onChange={(e) => handleUpdateSacco('address', e.target.value)}
              />
            </div>

            <div className="setting-item">
              <label>Registration Number</label>
              <input
                type="text"
                value={currentSacco.registrationNumber}
                onChange={(e) => handleUpdateSacco('registrationNumber', e.target.value)}
              />
            </div>

            <div className="setting-item">
              <label>Logo (2 letters)</label>
              <input
                type="text"
                value={currentSacco.logo}
                onChange={(e) => handleUpdateSacco('logo', e.target.value.substring(0, 2))}
                maxLength="2"
              />
            </div>
          </div>

          <p className="info-text">✓ Changes are saved automatically</p>
        </div>
      )}
    </div>
  );
}

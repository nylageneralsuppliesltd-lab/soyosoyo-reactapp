import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function ProfileHubPage() {
  const { session, setDeveloperMode, createSacco, getMySaccos, getOverview, logout } = useAuth();
  const [saccoForm, setSaccoForm] = useState({ name: '', registrationNumber: '' });
  const [mySaccos, setMySaccos] = useState([]);
  const [overview, setOverview] = useState(null);
  const [message, setMessage] = useState('');

  const loadSaccos = async () => {
    setMessage('');
    try {
      const data = await getMySaccos();
      setMySaccos(data.saccos || []);
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'Failed to load SACCOs');
    }
  };

  const createGroup = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await createSacco(saccoForm);
      setSaccoForm({ name: '', registrationNumber: '' });
      await loadSaccos();
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'Failed to create SACCO');
    }
  };

  const toggleDev = async () => {
    setMessage('');
    try {
      await setDeveloperMode(!session?.user?.developerMode);
      setOverview(null);
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'Failed to toggle developer mode');
    }
  };

  const loadOverview = async () => {
    setMessage('');
    try {
      const data = await getOverview();
      setOverview(data);
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'Failed to load developer overview');
    }
  };

  return (
    <div className="member-form-container">
      <div className="form-header">
        <div>
          <h1>Profile Hub</h1>
          <p className="form-subtitle">Manage profile mode, SACCO groups, and access visibility</p>
        </div>
      </div>

      {message && <div className="alert alert-error">{String(message)}</div>}

      <div className="member-form">
        <div className="form-section">
          <h2 className="section-title">Current Profile</h2>
          <p><strong>Name:</strong> {session?.user?.name || '-'}</p>
          <p><strong>Role:</strong> {session?.user?.role || '-'}</p>
          <p><strong>Admin Criteria:</strong> {session?.user?.adminCriteria || '-'}</p>
          <p><strong>Developer:</strong> {session?.user?.isSystemDeveloper ? 'Yes' : 'No'}</p>
          <p><strong>Developer Mode:</strong> {session?.user?.developerMode ? 'Enabled' : 'Disabled'}</p>
        </div>

        <div className="form-actions">
          {session?.user?.isSystemDeveloper && (
            <button type="button" className="btn-primary-large" onClick={toggleDev}>
              {session?.user?.developerMode ? 'Disable Developer Mode' : 'Enable Developer Mode'}
            </button>
          )}
          <button type="button" className="btn-secondary-large" onClick={logout}>Logout</button>
        </div>

        <div className="form-section">
          <h2 className="section-title">Create SACCO Group</h2>
          <form onSubmit={createGroup} className="form-grid">
            <div className="form-field">
              <label>Group Name</label>
              <input
                className="form-input"
                value={saccoForm.name}
                onChange={(e) => setSaccoForm({ ...saccoForm, name: e.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>Registration Number</label>
              <input
                className="form-input"
                value={saccoForm.registrationNumber}
                onChange={(e) => setSaccoForm({ ...saccoForm, registrationNumber: e.target.value })}
              />
            </div>
            <div className="form-actions">
              <button className="btn-primary-large">Create Group (3-Month Trial)</button>
              <button type="button" className="btn-secondary-large" onClick={loadSaccos}>Refresh My Groups</button>
            </div>
          </form>

          {mySaccos.length > 0 && (
            <div>
              {mySaccos.map((entry) => {
                const sacco = entry.sacco || entry;
                return (
                  <div key={sacco.id} className="form-section">
                    <p><strong>{sacco.name}</strong></p>
                    <p>Trial Ends: {sacco.trialEndsAt ? new Date(sacco.trialEndsAt).toLocaleDateString() : '-'}</p>
                    <p>Status: {sacco.isHiddenForNonPayment ? 'Hidden (Non-payment)' : sacco.billingStatus}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {session?.user?.isSystemDeveloper && session?.user?.developerMode && (
          <div className="form-section">
            <h2 className="section-title">Developer Overview</h2>
            <div className="form-actions">
              <button type="button" className="btn-primary-large" onClick={loadOverview}>Load All Profiles and SACCOs</button>
            </div>
            {overview && (
              <>
                <p><strong>Profiles:</strong> {overview.profiles?.length || 0}</p>
                <p><strong>SACCOs:</strong> {overview.saccos?.length || 0}</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    identifier: '',
    password: '',
    memberId: '',
    developerAccessKey: '',
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.identifier, form.password);
      } else {
        await register({
          memberId: form.memberId ? Number(form.memberId) : undefined,
          identifier: form.identifier || undefined,
          password: form.password,
          developerAccessKey: form.developerAccessKey || undefined,
        });
      }
      navigate('/profile-hub');
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="member-form-container">
      <div className="form-header">
        <div>
          <h1>{mode === 'login' ? 'Login' : 'Enable Member Profile'}</h1>
          <p className="form-subtitle">
            {mode === 'login'
              ? 'Sign in with email or mobile number'
              : 'Create real profile login for an existing member'}
          </p>
        </div>
      </div>

      {message && <div className="alert alert-error">{String(message)}</div>}

      <form onSubmit={submit} className="member-form">
        <div className="form-grid">
          <div className="form-field">
            <label>Identifier (Email or +CountryPhone)</label>
            <input
              className="form-input"
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              placeholder="e.g. +254712345678 or user@email.com"
              required={mode === 'login'}
            />
          </div>

          {mode === 'register' && (
            <div className="form-field">
              <label>Member ID (optional if identifier provided)</label>
              <input
                className="form-input"
                value={form.memberId}
                onChange={(e) => setForm({ ...form, memberId: e.target.value })}
                placeholder="e.g. 12"
              />
            </div>
          )}

          <div className="form-field">
            <label>Password</label>
            <input
              type="password"
              className="form-input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={6}
              required
            />
          </div>

          {mode === 'register' && (
            <div className="form-field">
              <label>Developer Access Key (optional)</label>
              <input
                type="password"
                className="form-input"
                value={form.developerAccessKey}
                onChange={(e) => setForm({ ...form, developerAccessKey: e.target.value })}
              />
            </div>
          )}
        </div>

        <div className="form-actions">
          <button className="btn-primary-large" disabled={loading}>
            {loading ? 'Processing...' : mode === 'login' ? 'Login' : 'Create Profile Login'}
          </button>
          <button
            type="button"
            className="btn-secondary-large"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Need profile setup?' : 'Back to login'}
          </button>
        </div>
      </form>
    </div>
  );
}

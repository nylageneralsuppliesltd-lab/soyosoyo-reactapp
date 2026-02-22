import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { resetPassword, verifyResetCode } from '../utils/authAPI';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login', 'register', 'reset', 'verify-reset'
  const [form, setForm] = useState({
    identifier: '',
    password: '',
    memberId: '',
    developerAccessKey: '',
  });
  const [resetForm, setResetForm] = useState({
    identifier: '',
    resetCode: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      if (!resetForm.identifier.trim()) {
        throw new Error('Please enter your email or phone number');
      }
      await resetPassword({ identifier: resetForm.identifier });
      setMessage('✓ Reset code sent! Check your email or SMS');
      setMode('verify-reset');
      setResetForm({ ...resetForm, resetCode: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyReset = async (e) => {
    e.preventDefault();
    setMessage('');
    
    if (!resetForm.resetCode.trim()) {
      setMessage('Please enter the reset code');
      return;
    }
    
    if (resetForm.newPassword !== resetForm.confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }
    
    if (resetForm.newPassword.length < 6) {
      setMessage('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await verifyResetCode({
        identifier: resetForm.identifier,
        resetCode: resetForm.resetCode,
        newPassword: resetForm.newPassword,
      });
      setMessage('✓ Password reset successful! You can now login.');
      setTimeout(() => {
        setMode('login');
        setResetForm({ identifier: '', resetCode: '', newPassword: '', confirmPassword: '' });
        setForm({ ...form, identifier: resetForm.identifier, password: '' });
      }, 2000);
    } catch (error) {
      setMessage(error?.response?.data?.message || error?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.identifier, form.password);
      } else if (mode === 'register') {
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
          <h1>
            {mode === 'login' 
              ? 'Login' 
              : mode === 'register' 
              ? 'Enable Member Profile'
              : mode === 'reset'
              ? 'Forgot Password'
              : 'Reset Password'}
          </h1>
          <p className="form-subtitle">
            {mode === 'login'
              ? 'Sign in with email or mobile number'
              : mode === 'register'
              ? 'Create real profile login for an existing member'
              : mode === 'reset'
              ? 'Enter your email or phone to receive a reset code'
              : 'Enter the reset code and your new password'}
          </p>
        </div>
      </div>

      {message && (
        <div className={`alert ${message.startsWith('✓') ? 'alert-success' : 'alert-error'}`}>
          {String(message)}
        </div>
      )}

      {/* LOGIN MODE */}
      {mode === 'login' && (
        <form onSubmit={submit} className="member-form">
          <div className="form-grid">
            <div className="form-field">
              <label>Identifier (Email or +CountryPhone)</label>
              <input
                className="form-input"
                value={form.identifier}
                onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                placeholder="e.g. +254712345678 or user@email.com"
                required
              />
            </div>

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
              <div style={{ marginTop: '8px', textAlign: 'right' }}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setMode('reset');
                    setResetForm({ ...resetForm, identifier: form.identifier });
                    setMessage('');
                  }}
                  style={{ fontSize: '0.9rem', color: '#3498db', textDecoration: 'none' }}
                >
                  Forgot your password?
                </button>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn-primary-large" disabled={loading}>
              {loading ? 'Processing...' : 'Login'}
            </button>
            <button
              type="button"
              className="btn-secondary-large"
              onClick={() => {
                setMode('register');
                setMessage('');
              }}
            >
              Need profile setup?
            </button>
          </div>
        </form>
      )}

      {/* REGISTER MODE */}
      {mode === 'register' && (
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

            <div className="form-field">
              <label>Member ID (optional if identifier provided)</label>
              <input
                className="form-input"
                value={form.memberId}
                onChange={(e) => setForm({ ...form, memberId: e.target.value })}
                placeholder="e.g. 12"
              />
            </div>

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

            <div className="form-field">
              <label>Developer Access Key (optional)</label>
              <input
                type="password"
                className="form-input"
                value={form.developerAccessKey}
                onChange={(e) => setForm({ ...form, developerAccessKey: e.target.value })}
              />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn-primary-large" disabled={loading}>
              {loading ? 'Processing...' : 'Create Profile Login'}
            </button>
            <button
              type="button"
              className="btn-secondary-large"
              onClick={() => {
                setMode('login');
                setMessage('');
              }}
            >
              Back to login
            </button>
          </div>
        </form>
      )}

      {/* PASSWORD RESET REQUEST MODE */}
      {mode === 'reset' && (
        <form onSubmit={handleRequestReset} className="member-form">
          <div className="form-grid">
            <div className="form-field">
              <label>Identifier (Email or +CountryPhone)</label>
              <input
                className="form-input"
                value={resetForm.identifier}
                onChange={(e) => setResetForm({ ...resetForm, identifier: e.target.value })}
                placeholder="e.g. +254712345678 or user@email.com"
                required
              />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn-primary-large" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Code'}
            </button>
            <button
              type="button"
              className="btn-secondary-large"
              onClick={() => {
                setMode('login');
                setMessage('');
              }}
            >
              Back to login
            </button>
          </div>
        </form>
      )}

      {/* PASSWORD RESET VERIFY MODE */}
      {mode === 'verify-reset' && (
        <form onSubmit={handleVerifyReset} className="member-form">
          <div className="form-grid">
            <div className="form-field">
              <label>Reset Code (sent to your email/SMS)</label>
              <input
                className="form-input"
                value={resetForm.resetCode}
                onChange={(e) => setResetForm({ ...resetForm, resetCode: e.target.value })}
                placeholder="Enter 6-digit code"
                maxLength={6}
                required
              />
            </div>

            <div className="form-field">
              <label>New Password</label>
              <input
                type="password"
                className="form-input"
                value={resetForm.newPassword}
                onChange={(e) => setResetForm({ ...resetForm, newPassword: e.target.value })}
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
            </div>

            <div className="form-field">
              <label>Confirm Password</label>
              <input
                type="password"
                className="form-input"
                value={resetForm.confirmPassword}
                onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
                placeholder="Confirm your new password"
                minLength={6}
                required
              />
            </div>
          </div>

          <div className="form-actions">
            <button className="btn-primary-large" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
            <button
              type="button"
              className="btn-secondary-large"
              onClick={() => {
                setMode('login');
                setMessage('');
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

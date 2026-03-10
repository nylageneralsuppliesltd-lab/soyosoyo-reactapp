import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPasswordResetDispatchStatus, resetPassword, verifyResetCode } from '../utils/authAPI';

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
  const [fieldErrors, setFieldErrors] = useState({});
  const [showSecrets, setShowSecrets] = useState({
    loginPassword: false,
    registerPassword: false,
    developerAccessKey: false,
    resetNewPassword: false,
    resetConfirmPassword: false,
  });

  const clearFieldError = (field) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const toggleSecret = (field) => {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const getErrorMessage = (error) => {
    const apiMessage = error?.response?.data?.message;
    if (Array.isArray(apiMessage)) return apiMessage.join('; ');
    return apiMessage || error?.message || 'Request failed';
  };

  const toFriendlyAuthMessage = (rawMessage) => {
    const messageText = String(rawMessage || '').trim();
    if (!messageText) return 'Request failed. Please try again.';

    if (/invalid credentials/i.test(messageText)) {
      return 'Email/phone or password is incorrect. Please check and try again.';
    }
    if (/profile login is not enabled/i.test(messageText)) {
      return 'Profile login is not enabled for this account yet. Use "Enable Member Profile" first.';
    }
    if (/invalid reset code/i.test(messageText)) {
      return 'Reset code is not valid. Use the latest code sent to your email and avoid spaces.';
    }
    if (/reset code expired/i.test(messageText)) {
      return 'Reset code has expired. Request a fresh code and try again.';
    }

    return messageText;
  };

  const pollResetDispatchStatus = async (requestId) => {
    const maxChecks = 10;
    const delayMs = 1500;

    for (let attempt = 1; attempt <= maxChecks; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      try {
        const response = await getPasswordResetDispatchStatus(requestId);
        const status = response?.data?.status;
        const detail = response?.data?.detail;

        console.log(`[PasswordResetDispatch] attempt=${attempt} requestId=${requestId} status=${status} detail=${detail || ''}`);

        if (status === 'sent') {
          setMessage('✓ Reset email dispatch confirmed. Check your inbox (and spam).');
          return;
        }

        if (status === 'failed') {
          setMessage('Reset email failed to dispatch. Please try again in a moment.');
          setMode('reset');
          return;
        }
      } catch (error) {
        console.warn('[PasswordResetDispatch] status check failed:', error?.message || error);
      }
    }

    setMessage('Reset request accepted. Delivery is still pending confirmation; check inbox/spam and retry if needed.');
  };

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setMessage('');
    setFieldErrors({});
    setLoading(true);
    try {
      const identifier = resetForm.identifier.trim();
      if (!identifier) {
        setFieldErrors({ resetIdentifier: 'Please enter your email or phone number' });
        throw new Error('Please enter your email or phone number');
      }

      const response = await resetPassword({ identifier });
      const requestId = response?.data?.requestId;
      const dispatchStatus = response?.data?.dispatchStatus;

      console.log('[PasswordResetDispatch] reset-request response:', response?.data);

      if (dispatchStatus === 'failed') {
        setMessage('Reset request accepted, but dispatch failed. Please try again.');
        return;
      }

      setMessage('✓ Reset request accepted. Checking delivery status...');
      setMode('verify-reset');
      setResetForm({ ...resetForm, identifier, resetCode: '', newPassword: '', confirmPassword: '' });

      if (requestId) {
        pollResetDispatchStatus(requestId);
      } else {
        console.warn('[PasswordResetDispatch] No requestId in reset-request response; cannot verify dispatch status');
      }
    } catch (error) {
      setMessage(toFriendlyAuthMessage(getErrorMessage(error) || 'Failed to send reset code'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyReset = async (e) => {
    e.preventDefault();
    setMessage('');
    setFieldErrors({});

    const normalizedCode = String(resetForm.resetCode || '').replace(/\s+/g, '').trim();
    const newPassword = String(resetForm.newPassword || '');
    const confirmPassword = String(resetForm.confirmPassword || '');
    const errors = {};
    
    if (!normalizedCode) {
      errors.resetCode = 'Please enter the reset code';
    } else if (!/^\d{6}$/.test(normalizedCode)) {
      errors.resetCode = 'Reset code must be exactly 6 digits';
    }
    
    if (newPassword.length < 6) {
      errors.newPassword = 'Password must be at least 6 characters';
    }

    if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setMessage('Please fix the highlighted fields and try again.');
      return;
    }

    setLoading(true);
    try {
      await verifyResetCode({
        identifier: resetForm.identifier,
        resetCode: normalizedCode,
        newPassword,
      });
      setMessage('✓ Password reset successful! You can now login.');
      setTimeout(() => {
        setMode('login');
        setResetForm({ identifier: '', resetCode: '', newPassword: '', confirmPassword: '' });
        setForm({ ...form, identifier: resetForm.identifier, password: '' });
      }, 2000);
    } catch (error) {
      setMessage(toFriendlyAuthMessage(getErrorMessage(error) || 'Failed to reset password'));
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setMessage('');
    setFieldErrors({});
    setLoading(true);
    try {
      if (mode === 'login') {
        const identifier = String(form.identifier || '').trim();
        const password = String(form.password || '');
        const errors = {};
        if (!identifier) errors.identifier = 'Identifier is required';
        if (!password) errors.password = 'Password is required';
        if (Object.keys(errors).length) {
          setFieldErrors(errors);
          throw new Error('Please provide login credentials');
        }
        await login(identifier, password);
      } else if (mode === 'register') {
        const password = String(form.password || '');
        if (password.length < 6) {
          setFieldErrors({ registerPassword: 'Password must be at least 6 characters' });
          throw new Error('Password must be at least 6 characters');
        }
        await register({
          memberId: form.memberId ? Number(form.memberId) : undefined,
          identifier: form.identifier ? String(form.identifier).trim() : undefined,
          password,
          developerAccessKey: form.developerAccessKey || undefined,
        });
      }
      navigate('/profile-hub');
    } catch (error) {
      setMessage(toFriendlyAuthMessage(getErrorMessage(error) || 'Request failed'));
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
                onChange={(e) => {
                  setForm({ ...form, identifier: e.target.value });
                  clearFieldError('identifier');
                }}
                placeholder="e.g. +254712345678 or user@email.com"
                required
              />
              {fieldErrors.identifier && (
                <div style={{ color: '#c0392b', fontSize: '0.85rem', marginTop: 6 }}>{fieldErrors.identifier}</div>
              )}
            </div>

            <div className="form-field">
              <label>Password</label>
              <input
                type={showSecrets.loginPassword ? 'text' : 'password'}
                className="form-input"
                value={form.password}
                onChange={(e) => {
                  setForm({ ...form, password: e.target.value });
                  clearFieldError('password');
                }}
                minLength={6}
                required
              />
              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => toggleSecret('loginPassword')}
                  style={{ fontSize: '0.9rem', color: '#2c3e50', textDecoration: 'none' }}
                >
                  {showSecrets.loginPassword ? 'Hide password' : 'Show password'}
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setMode('reset');
                    setResetForm({ ...resetForm, identifier: form.identifier });
                    setMessage('');
                    setFieldErrors({});
                  }}
                  style={{ fontSize: '0.9rem', color: '#3498db', textDecoration: 'none' }}
                >
                  Forgot your password?
                </button>
              </div>
              {fieldErrors.password && (
                <div style={{ color: '#c0392b', fontSize: '0.85rem', marginTop: 6 }}>{fieldErrors.password}</div>
              )}
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
                type={showSecrets.registerPassword ? 'text' : 'password'}
                className="form-input"
                value={form.password}
                onChange={(e) => {
                  setForm({ ...form, password: e.target.value });
                  clearFieldError('registerPassword');
                }}
                minLength={6}
                required
              />
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => toggleSecret('registerPassword')}
                  style={{ fontSize: '0.9rem', color: '#2c3e50', textDecoration: 'none' }}
                >
                  {showSecrets.registerPassword ? 'Hide password' : 'Show password'}
                </button>
              </div>
              {fieldErrors.registerPassword && (
                <div style={{ color: '#c0392b', fontSize: '0.85rem', marginTop: 6 }}>{fieldErrors.registerPassword}</div>
              )}
            </div>

            <div className="form-field">
              <label>Developer Access Key (optional)</label>
              <input
                type={showSecrets.developerAccessKey ? 'text' : 'password'}
                className="form-input"
                value={form.developerAccessKey}
                onChange={(e) => setForm({ ...form, developerAccessKey: e.target.value })}
              />
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => toggleSecret('developerAccessKey')}
                  style={{ fontSize: '0.9rem', color: '#2c3e50', textDecoration: 'none' }}
                >
                  {showSecrets.developerAccessKey ? 'Hide access key' : 'Show access key'}
                </button>
              </div>
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
                onChange={(e) => {
                  setResetForm({ ...resetForm, identifier: e.target.value });
                  clearFieldError('resetIdentifier');
                }}
                placeholder="e.g. +254712345678 or user@email.com"
                required
              />
              {fieldErrors.resetIdentifier && (
                <div style={{ color: '#c0392b', fontSize: '0.85rem', marginTop: 6 }}>{fieldErrors.resetIdentifier}</div>
              )}
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
                onChange={(e) => {
                  setResetForm({ ...resetForm, resetCode: e.target.value });
                  clearFieldError('resetCode');
                }}
                placeholder="Enter 6-digit code"
                maxLength={6}
                required
              />
              <div style={{ color: '#7f8c8d', fontSize: '0.82rem', marginTop: 6 }}>
                Tip: paste only digits; spaces are ignored automatically.
              </div>
              {fieldErrors.resetCode && (
                <div style={{ color: '#c0392b', fontSize: '0.85rem', marginTop: 6 }}>{fieldErrors.resetCode}</div>
              )}
            </div>

            <div className="form-field">
              <label>New Password</label>
              <input
                type={showSecrets.resetNewPassword ? 'text' : 'password'}
                className="form-input"
                value={resetForm.newPassword}
                onChange={(e) => {
                  setResetForm({ ...resetForm, newPassword: e.target.value });
                  clearFieldError('newPassword');
                }}
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => toggleSecret('resetNewPassword')}
                  style={{ fontSize: '0.9rem', color: '#2c3e50', textDecoration: 'none' }}
                >
                  {showSecrets.resetNewPassword ? 'Hide password' : 'Show password'}
                </button>
              </div>
              {fieldErrors.newPassword && (
                <div style={{ color: '#c0392b', fontSize: '0.85rem', marginTop: 6 }}>{fieldErrors.newPassword}</div>
              )}
            </div>

            <div className="form-field">
              <label>Confirm Password</label>
              <input
                type={showSecrets.resetConfirmPassword ? 'text' : 'password'}
                className="form-input"
                value={resetForm.confirmPassword}
                onChange={(e) => {
                  setResetForm({ ...resetForm, confirmPassword: e.target.value });
                  clearFieldError('confirmPassword');
                }}
                placeholder="Confirm your new password"
                minLength={6}
                required
              />
              <div style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => toggleSecret('resetConfirmPassword')}
                  style={{ fontSize: '0.9rem', color: '#2c3e50', textDecoration: 'none' }}
                >
                  {showSecrets.resetConfirmPassword ? 'Hide password' : 'Show password'}
                </button>
              </div>
              {fieldErrors.confirmPassword && (
                <div style={{ color: '#c0392b', fontSize: '0.85rem', marginTop: 6 }}>{fieldErrors.confirmPassword}</div>
              )}
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

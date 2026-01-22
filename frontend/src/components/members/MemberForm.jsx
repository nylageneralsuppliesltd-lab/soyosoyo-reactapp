import React, { useState, useEffect } from 'react';
import { createMember, updateMember } from './membersAPI';
import NomineeInputs from './NomineeInputs';
import '../../../src/styles/members.css';

export default function MemberForm({ member = null, goBack }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    idNumber: '',
    dob: '',
    gender: '',
    physicalAddress: '',
    town: '',
    employmentStatus: '',
    employerName: '',
    regNo: '',
    employerAddress: '',
    role: 'Member',
    introducerName: '',
    introducerMemberNo: '',
  });

  const [nominees, setNominees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitMessage, setSubmitMessage] = useState(null);

  useEffect(() => {
    if (member) {
      setForm({
        ...member,
        dob: member.dob ? member.dob.split('T')[0] : '',
        role: member.role || 'Member',
      });
      setNominees(member.nextOfKin || []);
    }
  }, [member]);

  const handleChange = (field, value) => {
    setForm({ ...form, [field]: value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: null });
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Name validation
    if (!form.name || form.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    // Phone validation (basic Kenyan format)
    if (!form.phone || !/^(\+254|254|0)[7-9]\d{8}$/.test(form.phone)) {
      newErrors.phone = 'Phone must be a valid Kenyan number (07..., +254..., or 254...)';
    }

    // Email validation (optional but if provided, must be valid)
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Email must be a valid email address';
    }

    // ID Number validation (optional but if provided, must be 5-10 digits)
    if (form.idNumber && !/^\d{5,10}$/.test(form.idNumber)) {
      newErrors.idNumber = 'ID Number must be 5-10 digits';
    }

    // Introducer validation
    if (!form.introducerName || form.introducerName.trim().length < 2) {
      newErrors.introducerName = 'Introducer name must be at least 2 characters';
    }

    if (!form.introducerMemberNo || form.introducerMemberNo.trim().length < 1) {
      newErrors.introducerMemberNo = 'Introducer member number is required';
    }

    // Nominee shares validation
    if (nominees.length > 0) {
      const totalShare = nominees.reduce((sum, n) => sum + (n.share || 0), 0);
      if (Math.abs(totalShare - 100) > 0.01) {
        newErrors.nominees = `Nominee shares must total 100%. Current total: ${totalShare}%`;
      }
    }

    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitMessage(null);

    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      const payload = { ...form, nextOfKin: nominees.length > 0 ? nominees : null };

      if (member) {
        await updateMember(member.id, payload);
        setSubmitMessage({ type: 'success', text: '✓ Member updated successfully!' });
      } else {
        await createMember(payload);
        setSubmitMessage({ type: 'success', text: '✓ Member registered successfully!' });
      }

      setTimeout(() => goBack(), 1500);
    } catch (err) {
      let message = 'Error submitting form.';

      if (err.response?.data?.message) {
        message = err.response.data.message;
      } else if (err.message?.includes('ERR_CONN')) {
        message = 'Cannot connect to server. Please check your connection and try again.';
      } else if (err.message) {
        message = err.message;
      }

      setSubmitMessage({ type: 'error', text: '✗ ' + message });
      console.error('[MemberForm] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formSections = [
    {
      title: 'Personal Information',
      fields: [
        { key: 'name', label: 'Full Name', type: 'text', required: true },
        { key: 'phone', label: 'Phone Number', type: 'tel', required: true },
        { key: 'email', label: 'Email Address', type: 'email', required: false },
        { key: 'idNumber', label: 'ID Number', type: 'text', required: false },
        { key: 'dob', label: 'Date of Birth', type: 'date', required: false },
        {
          key: 'gender',
          label: 'Gender',
          type: 'select',
          options: ['Male', 'Female', 'Other'],
          required: false,
        },
      ],
    },
    {
      title: 'Contact & Location',
      fields: [
        { key: 'physicalAddress', label: 'Physical Address', type: 'text', required: false },
        { key: 'town', label: 'Town/City', type: 'text', required: false },
      ],
    },
    {
      title: 'Employment Information',
      fields: [
        {
          key: 'employmentStatus',
          label: 'Employment Status',
          type: 'select',
          options: ['Employed', 'Self-Employed', 'Unemployed', 'Retired', 'Student'],
          required: false,
        },
        { key: 'employerName', label: 'Employer Name', type: 'text', required: false },
        { key: 'regNo', label: 'Registration Number', type: 'text', required: false },
        { key: 'employerAddress', label: 'Employer Address', type: 'text', required: false },
      ],
    },
    {
      title: 'SACCO Information',
      fields: [
        {
          key: 'role',
          label: 'Role',
          type: 'select',
          options: ['Member', 'Chairman', 'Vice Chairman', 'Secretary', 'Treasurer', 'Admin'],
          required: true,
        },
        { key: 'introducerName', label: 'Introducer Name', type: 'text', required: true },
        { key: 'introducerMemberNo', label: 'Introducer Member Number', type: 'text', required: true },
      ],
    },
  ];

  return (
    <div className="form-card">
      <h1>{member ? 'Edit Member' : 'Register New Member'}</h1>

      {submitMessage && (
        <div className={`alert alert-${submitMessage.type}`}>{submitMessage.text}</div>
      )}

      {errors.nominees && <div className="alert alert-error">{errors.nominees}</div>}

      <form onSubmit={handleSubmit}>
        {formSections.map((section) => (
          <div key={section.title}>
            <h3 style={{ marginTop: '20px', marginBottom: '12px', fontSize: '16px', color: '#1f2937' }}>
              {section.title}
            </h3>

            {section.fields.map((fieldConfig) => (
              <div key={fieldConfig.key} className="form-group">
                <label>
                  {fieldConfig.label}
                  {fieldConfig.required && <span style={{ color: '#ef4444' }}>*</span>}
                </label>

                {fieldConfig.type === 'select' ? (
                  <select
                    className={`input ${errors[fieldConfig.key] ? 'error' : ''}`}
                    value={form[fieldConfig.key]}
                    onChange={(e) => handleChange(fieldConfig.key, e.target.value)}
                    required={fieldConfig.required}
                  >
                    <option value="">Select {fieldConfig.label}</option>
                    {fieldConfig.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={fieldConfig.type}
                    className={`input ${errors[fieldConfig.key] ? 'error' : ''}`}
                    placeholder={fieldConfig.label}
                    value={form[fieldConfig.key]}
                    onChange={(e) => handleChange(fieldConfig.key, e.target.value)}
                    required={fieldConfig.required}
                  />
                )}

                {errors[fieldConfig.key] && (
                  <small style={{ color: '#dc2626', marginTop: '4px', display: 'block' }}>
                    {errors[fieldConfig.key]}
                  </small>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* Nominees Section */}
        <div>
          <h3 style={{ marginTop: '20px', marginBottom: '12px', fontSize: '16px', color: '#1f2937' }}>
            Next of Kin (Optional)
          </h3>
          <NomineeInputs nominees={nominees} setNominees={setNominees} />
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px', flexWrap: 'wrap' }}>
          <button
            type="submit"
            className="submit-btn"
            disabled={loading}
            style={{ flex: 1, minWidth: '120px', opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? '⏳ Processing...' : member ? '✓ Update Member' : '✓ Register Member'}
          </button>
          <button
            type="button"
            className="submit-btn"
            onClick={goBack}
            disabled={loading}
            style={{ flex: 1, minWidth: '120px', background: '#6b7280', opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            ← Back
          </button>
        </div>
      </form>
    </div>
  );
}

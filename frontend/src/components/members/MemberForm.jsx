import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMember, updateMember } from './membersAPI';
import NomineeInputs from './NomineeInputs';
import '../../../src/styles/members.css';

export default function MemberForm({ member = null, goBack }) {
  const navigate = useNavigate();
  const handleGoBack = typeof goBack === 'function' ? goBack : () => navigate(-1);
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
    adminCriteria: 'Member',
    introducerName: '',
    introducerMemberNo: '',
  });

  const [nominees, setNominees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitMessage, setSubmitMessage] = useState(null);

  useEffect(() => {
    if (member) {
      const toSafeString = (value) => (value === undefined || value === null ? '' : String(value));
      setForm({
        name: toSafeString(member.name),
        phone: toSafeString(member.phone),
        email: toSafeString(member.email),
        idNumber: toSafeString(member.idNumber),
        dob: member.dob ? String(member.dob).split('T')[0] : '',
        gender: toSafeString(member.gender),
        physicalAddress: toSafeString(member.physicalAddress),
        town: toSafeString(member.town),
        employmentStatus: toSafeString(member.employmentStatus),
        employerName: toSafeString(member.employerName),
        regNo: toSafeString(member.regNo),
        employerAddress: toSafeString(member.employerAddress),
        role: member.role || 'Member',
        adminCriteria: member.adminCriteria || 'Member',
        introducerName: toSafeString(member.introducerName),
        introducerMemberNo: toSafeString(member.introducerMemberNo),
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
      const nextOfKin = nominees.length > 0 ? nominees : undefined;
      const payload = { ...form, ...(nextOfKin ? { nextOfKin } : {}) };

      if (member) {
        await updateMember(member.id, payload);
        setSubmitMessage({ type: 'success', text: '✓ Member updated successfully!' });
      } else {
        await createMember(payload);
        setSubmitMessage({ type: 'success', text: '✓ Member registered successfully!' });
      }

      setTimeout(() => handleGoBack(), 1500);
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
        {
          key: 'adminCriteria',
          label: 'Admin Criteria',
          type: 'select',
          options: ['Member', 'Admin'],
          required: false,
        },
        { key: 'introducerName', label: 'Introducer Name', type: 'text', required: true },
        { key: 'introducerMemberNo', label: 'Introducer Member Number', type: 'text', required: true },
      ],
    },
  ];

  return (
    <div className="member-form-container">
      <div className="form-header">
        <div>
          <h1>{member ? 'Edit Member' : 'Register New Member'}</h1>
          <p className="form-subtitle">{member ? 'Update member details and information' : 'Add a new member to the SACCO'}</p>
        </div>
      </div>

      {submitMessage && (
        <div className={`alert alert-${submitMessage.type}`}>{submitMessage.text}</div>
      )}

      {errors.nominees && <div className="alert alert-error">{errors.nominees}</div>}

      <form onSubmit={handleSubmit} className="member-form">
        {formSections.map((section, sectionIdx) => (
          <div key={section.title} className="form-section">
            <h2 className="section-title">{section.title}</h2>
            <div className="form-grid">
              {section.fields.map((fieldConfig) => (
                <div key={fieldConfig.key} className="form-field">
                  <label htmlFor={fieldConfig.key}>
                    {fieldConfig.label}
                    {fieldConfig.required && <span className="required">*</span>}
                  </label>

                  {fieldConfig.type === 'select' ? (
                    <select
                      id={fieldConfig.key}
                      className={`form-input ${errors[fieldConfig.key] ? 'error' : ''}`}
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
                      id={fieldConfig.key}
                      type={fieldConfig.type}
                      className={`form-input ${errors[fieldConfig.key] ? 'error' : ''}`}
                      placeholder={fieldConfig.label}
                      value={form[fieldConfig.key]}
                      onChange={(e) => handleChange(fieldConfig.key, e.target.value)}
                      required={fieldConfig.required}
                    />
                  )}

                  {errors[fieldConfig.key] && (
                    <span className="field-error">{errors[fieldConfig.key]}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Nominees Section - Collapsible */}
        <div className="form-section nominees-section">
          <h2 className="section-title">Next of Kin / Nominees (Optional)</h2>
          <p className="section-subtitle">Add up to 3 nominees. Share percentages must total 100%</p>
          <NomineeInputs nominees={nominees} setNominees={setNominees} />
        </div>

        {/* Action Buttons */}
        <div className="form-actions">
          <button
            type="submit"
            className="btn-primary-large"
            disabled={loading}
          >
            {loading ? '⏳ Processing...' : member ? '✓ Update Member' : '✓ Register Member'}
          </button>
          <button
            type="button"
            className="btn-secondary-large"
            onClick={handleGoBack}
            disabled={loading}
          >
            ← Back
          </button>
        </div>
      </form>
    </div>
  );
}

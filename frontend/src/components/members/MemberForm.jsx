import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMember, updateMember } from './membersAPI';
import NomineeInputs from './NomineeInputs';
import '../../../src/styles/members.css';

export default function MemberForm({ member = null, goBack }) {
  const navigate = useNavigate();
  const handleGoBack = typeof goBack === 'function' ? goBack : () => navigate(-1);
  const [countryCodes, setCountryCodes] = useState([
    { label: 'Kenya (+254)', value: '+254' },
    { label: 'Uganda (+256)', value: '+256' },
    { label: 'Tanzania (+255)', value: '+255' },
    { label: 'Rwanda (+250)', value: '+250' },
    { label: 'South Africa (+27)', value: '+27' },
    { label: 'United States (+1)', value: '+1' },
    { label: 'United Kingdom (+44)', value: '+44' },
  ]);

  const [form, setForm] = useState({
    name: '',
    countryCode: '+254',
    phone: '',
    email: '',
    idNumber: '',
    dob: '',
    gender: '',
    documentType: '',
    documentNumber: '',
    kraPIN: '',
    physicalAddress: '',
    town: '',
    employmentStatus: '',
    employerName: '',
    regNo: '',
    employerAddress: '',
    role: 'Member',
    adminCriteria: 'Member',
    password: '',
    introducerName: '',
    introducerMemberNo: '',
  });

  const [nominees, setNominees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitMessage, setSubmitMessage] = useState(null);

  useEffect(() => {
    let mounted = true;
    const loadCountryCodes = async () => {
      try {
        const res = await fetch('https://restcountries.com/v3.1/all?fields=name,idd');
        if (!res.ok) return;
        const countries = await res.json();
        const mapped = countries
          .map((c) => {
            const root = c?.idd?.root || '';
            const suffix = Array.isArray(c?.idd?.suffixes) && c.idd.suffixes.length ? c.idd.suffixes[0] : '';
            const value = `${root}${suffix}`;
            if (!/^\+[1-9]\d{0,3}$/.test(value)) return null;
            return {
              label: `${c?.name?.common || 'Unknown'} (${value})`,
              value,
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.label.localeCompare(b.label));

        if (mounted && mapped.length > 0) {
          const unique = Array.from(new Map(mapped.map((c) => [c.value, c])).values());
          setCountryCodes(unique);
        }
      } catch (error) {
        console.warn('Unable to fetch country codes, using fallback list.');
      }
    };

    loadCountryCodes();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (member) {
      const toSafeString = (value) => (value === undefined || value === null ? '' : String(value));
      const phoneValue = toSafeString(member.phone).replace(/[\s()-]/g, '');
      const phoneMatch = phoneValue.match(/^(\+\d{1,4})(\d{4,14})$/);
      setForm({
        name: toSafeString(member.name),
        countryCode: phoneMatch ? phoneMatch[1] : '+254',
        phone: phoneMatch ? phoneMatch[2] : phoneValue.replace(/^\+/, ''),
        email: toSafeString(member.email),
        idNumber: toSafeString(member.idNumber),
        dob: member.dob ? String(member.dob).split('T')[0] : '',
        gender: toSafeString(member.gender),
        documentType: toSafeString(member.documentType),
        documentNumber: toSafeString(member.documentNumber),
        kraPIN: toSafeString(member.kraPIN),
        physicalAddress: toSafeString(member.physicalAddress),
        town: toSafeString(member.town),
        employmentStatus: toSafeString(member.employmentStatus),
        employerName: toSafeString(member.employerName),
        regNo: toSafeString(member.regNo),
        employerAddress: toSafeString(member.employerAddress),
        role: member.role || 'Member',
        adminCriteria: member.adminCriteria || 'Member',
        password: '',
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

  const calculateAge = (dobString) => {
    if (!dobString) return null;
    const dob = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  };

  const validateForm = () => {
    const newErrors = {};

    // Name validation
    if (!form.name || form.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    const sanitizedPhone = String(form.phone || '').replace(/\D/g, '');
    const fullPhone = `${form.countryCode || ''}${sanitizedPhone}`;
    if (!sanitizedPhone || !/^\+[1-9]\d{7,14}$/.test(fullPhone)) {
      newErrors.phone = 'Phone must be valid in international format with country code';
    }

    // Email validation (optional but if provided, must be valid)
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Email must be a valid email address';
    }

    // ID Number validation (optional but if provided, must be 5-10 digits)
    if (form.idNumber && !/^\d{5,10}$/.test(form.idNumber)) {
      newErrors.idNumber = 'ID Number must be 5-10 digits';
    }

    // Date of Birth / Age validation (optional but if provided, must be 18+)
    if (form.dob) {
      const age = calculateAge(form.dob);
      if (age !== null && age < 18) {
        newErrors.dob = `Member must be 18 years or older (currently ${age} years old)`;
      }
    }

    // Document Type validation (if document number is provided, document type must be selected)
    if (form.documentNumber && !form.documentType) {
      newErrors.documentType = 'Please select a document type when providing a document number';
    }

    // Document Number validation (optional but if provided, must be valid format)
    if (form.documentNumber) {
      if (form.documentType === 'ID' && !/^\d{5,10}$/.test(form.documentNumber)) {
        newErrors.documentNumber = 'ID Number must be 5-10 digits';
      } else if (form.documentType === 'Passport' && !/^[A-Z0-9]{6,10}$/.test(form.documentNumber)) {
        newErrors.documentNumber = 'Passport number must be 6-10 alphanumeric characters';
      }
    }

    // KRA PIN validation (optional but if provided, must match KRA PIN format: A0123456ZZZA)
    if (form.kraPIN && !/^[A-Z]{1}\d{7}[A-Z]{3}[A-Z]$/.test(form.kraPIN.toUpperCase())) {
      newErrors.kraPIN = 'KRA PIN must be in format: A0123456ZZZA (letter, 7 digits, 3 letters, 1 letter)';
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
      const payload = {
        ...form,
        phone: `${form.countryCode}${String(form.phone || '').replace(/\D/g, '')}`,
        ...(nextOfKin ? { nextOfKin } : {}),
      };

      delete payload.countryCode;

      if (!payload.password || !payload.password.trim()) {
        delete payload.password;
      }

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
        {
          key: 'countryCode',
          label: 'Country Code',
          type: 'select',
          options: countryCodes.map((c) => c.value),
          optionLabels: Object.fromEntries(countryCodes.map((c) => [c.value, c.label])),
          required: true,
        },
        { key: 'phone', label: 'Mobile Number', type: 'tel', required: true },
        { key: 'email', label: 'Email Address', type: 'email', required: false },
        { key: 'idNumber', label: 'Existing ID Number', type: 'text', required: false },
        { key: 'dob', label: 'Date of Birth', type: 'date', required: false },
        {
          key: 'gender',
          label: 'Gender',
          type: 'select',
          options: ['Male', 'Female', 'Other'],
          required: false,
        },
        {
          key: 'documentType',
          label: 'Provided Document Type',
          type: 'select',
          options: ['ID', 'Passport'],
          required: false,
          description: 'Type of document provided for SASRA membership (ID or Passport)',
        },
        { key: 'documentNumber', label: 'Document Number', type: 'text', required: false, description: 'ID or Passport number' },
        { key: 'kraPIN', label: 'KRA PIN', type: 'text', required: false, description: 'Kenya Revenue Authority PIN (format: A0123456ZZZA)' },
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
        { key: 'password', label: 'Profile Password (optional)', type: 'password', required: false },
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
                          {fieldConfig.optionLabels?.[opt] || opt}
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

                  {fieldConfig.description && (
                    <small style={{ display: 'block', marginTop: '4px', color: '#666', fontSize: '12px' }}>
                      {fieldConfig.description}
                    </small>
                  )}

                  {fieldConfig.key === 'dob' && form.dob && (
                    <small style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: calculateAge(form.dob) < 18 ? '#e74c3c' : '#27ae60' }}>
                      Age: {calculateAge(form.dob)} years {calculateAge(form.dob) < 18 && '⚠️ (Must be 18+)'}
                    </small>
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

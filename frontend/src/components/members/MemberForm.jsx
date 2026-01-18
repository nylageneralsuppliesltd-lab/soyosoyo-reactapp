import React, { useState, useEffect } from 'react';
import { createMember, updateMember } from './membersAPI';
import NomineeInputs from './NomineeInputs';

export default function MemberForm({ member = null, goBack }) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', idNumber: '', dob: '', gender: '',
    physicalAddress: '', town: '', employmentStatus: '', employerName: '',
    regNo: '', employerAddress: '', role: 'Member', customRole: '',
    introducerName: '', introducerMemberNo: '',
  });

  const [nominees, setNominees] = useState([]);

  useEffect(() => {
    if (member) {
      setForm({ ...member, customRole: member.role !== 'Member' && member.role !== 'Chairman' && member.role !== 'Vice Chairman' && member.role !== 'Secretary' && member.role !== 'Treasurer' && member.role !== 'Admin' ? member.role : '' });
      setNominees(member.nextOfKin || []);
    }
  }, [member]);

  const handleChange = (field, value) => setForm({ ...form, [field]: value });

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate nominee shares
    const totalShare = nominees.reduce((sum, n) => sum + (n.share || 0), 0);
    if (nominees.length && Math.abs(totalShare - 100) > 0.01) {
      return alert(`Nominee shares must total 100%. Current total: ${totalShare}%`);
    }

    const payload = { ...form, role: form.role === 'Other' ? form.customRole : form.role, nextOfKin: nominees };

    try {
      if (member) await updateMember(member.id, payload);
      else await createMember(payload);
      alert(member ? 'Member updated' : 'Member created');
      goBack();
    } catch (err) {
      // Improved error handling
      let message = 'Error submitting form.';
      // Log error to browser console for debugging
      console.error('Member creation failed:', err);
      if (err.response) {
        if (err.response.status === 0 || err.message?.includes('ERR_CONNECTION_REFUSED')) {
          message = 'Cannot connect to server. Please check your backend and try again.';
        } else {
          message = err.response.data?.message || `Server error: ${err.response.status}`;
        }
      } else if (err.message) {
        message = err.message;
      }
      alert(message);
    }
  };

  return (
    <div className="form-card">
      <h1>{member ? 'Edit Member' : 'Register Member'}</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Full Name <span style={{color:'red'}}>*</span></label>
          <input className="input" placeholder="Full Name" value={form.name} onChange={e => handleChange('name', e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Phone <span style={{color:'red'}}>*</span></label>
          <input className="input" placeholder="Phone" value={form.phone} onChange={e => handleChange('phone', e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input className="input" placeholder="Email" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} />
        </div>
        <div className="form-group">
          <label>ID Number</label>
          <input className="input" placeholder="ID Number" value={form.idNumber} onChange={e => handleChange('idNumber', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Date of Birth</label>
          <input className="input" type="date" value={form.dob} onChange={e => handleChange('dob', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Gender</label>
          <select className="input" value={form.gender} onChange={e => handleChange('gender', e.target.value)}>
            <option value="">Select Gender</option>
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
        </div>
        <div className="form-group">
          <label>Physical Address</label>
          <input className="input" placeholder="Physical Address" value={form.physicalAddress} onChange={e => handleChange('physicalAddress', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Town/City</label>
          <input className="input" placeholder="Town/City" value={form.town} onChange={e => handleChange('town', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Employment Status</label>
          <select className="input" value={form.employmentStatus} onChange={e => handleChange('employmentStatus', e.target.value)}>
            <option value="">Employment Status</option>
            <option>Employed</option>
            <option>Self-Employed</option>
            <option>Unemployed</option>
            <option>Retired</option>
          </select>
        </div>
        <div className="form-group">
          <label>Employer Name</label>
          <input className="input" placeholder="Employer Name" value={form.employerName} onChange={e => handleChange('employerName', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Registration No</label>
          <input className="input" placeholder="Registration No" value={form.regNo} onChange={e => handleChange('regNo', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Employer Address</label>
          <input className="input" placeholder="Employer Address" value={form.employerAddress} onChange={e => handleChange('employerAddress', e.target.value)} />
        </div>
        <div className="form-group">
          <label>Role</label>
          <select className="input" value={form.role} onChange={e => handleChange('role', e.target.value)}>
            <option>Member</option>
            <option>Chairman</option>
            <option>Vice Chairman</option>
            <option>Secretary</option>
            <option>Treasurer</option>
            <option>Admin</option>
            <option value="Other">Other</option>
          </select>
        </div>
        {form.role === 'Other' && (
          <div className="form-group">
            <label>Custom Role</label>
            <input className="input" placeholder="Custom Role" value={form.customRole} onChange={e => handleChange('customRole', e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label>Introducer Name <span style={{color:'red'}}>*</span></label>
          <input className="input" placeholder="Introducer Name" value={form.introducerName} onChange={e => handleChange('introducerName', e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Introducer Member No <span style={{color:'red'}}>*</span></label>
          <input className="input" placeholder="Introducer Member No" value={form.introducerMemberNo} onChange={e => handleChange('introducerMemberNo', e.target.value)} required />
        </div>
        <NomineeInputs nominees={nominees} setNominees={setNominees} />
        <div className="form-group" style={{display:'flex',gap:'1rem',marginTop:'1.5rem'}}>
          <button type="submit" className="submit-btn">{member ? 'Update Member' : 'Register Member'}</button>
          <button type="button" className="submit-btn" style={{background:'#6c757d'}} onClick={goBack}>Back</button>
        </div>
      </form>
    </div>
  );
}

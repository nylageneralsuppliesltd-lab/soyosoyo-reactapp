import React from 'react';

export default function NomineeInputs({ nominees, setNominees }) {
  const addNominee = () => {
    if (nominees.length >= 3) return alert('Maximum 3 nominees allowed');
    setNominees([...nominees, { name: '', relationship: '', id: '', phone: '', share: 0 }]);
  };

  const removeNominee = (index) => {
    setNominees(nominees.filter((_, i) => i !== index));
  };

  const updateNominee = (index, field, value) => {
    const updated = [...nominees];
    updated[index][field] = value;
    setNominees(updated);
  };

  return (
    <div>
      <h3>Nominees</h3>
      {nominees.map((nok, idx) => (
        <div key={idx} style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px', borderRadius: '6px' }}>
          <h4>Nominee {idx + 1}</h4>
          <input placeholder="Name" value={nok.name} onChange={(e) => updateNominee(idx, 'name', e.target.value)} required />
          <input placeholder="Relationship" value={nok.relationship} onChange={(e) => updateNominee(idx, 'relationship', e.target.value)} required />
          <input placeholder="ID Number" value={nok.id} onChange={(e) => updateNominee(idx, 'id', e.target.value)} required />
          <input placeholder="Phone" value={nok.phone} onChange={(e) => updateNominee(idx, 'phone', e.target.value)} required />
          <input type="number" placeholder="Share %" value={nok.share} min={1} max={100} onChange={(e) => updateNominee(idx, 'share', parseFloat(e.target.value))} required />
          <button type="button" onClick={() => removeNominee(idx)} style={{ background: '#dc3545', color: '#fff', marginTop: '5px' }}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={addNominee} style={{ background: '#17a2b8', color: '#fff', marginTop: '10px' }}>+ Add Nominee</button>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { getMembers, suspendMember, reactivateMember } from './membersAPI';
import MemberLedger from './MemberLedger';
import MemberForm from './MemberForm';

export default function MembersList() {
  const [members, setMembers] = useState([]);
  const [view, setView] = useState('list'); // list | form | ledger
  const [selectedMember, setSelectedMember] = useState(null);

  const fetchMembers = async () => {
    const res = await getMembers();
    setMembers(res.data);
  };

  useEffect(() => { fetchMembers(); }, []);

  const handleSuspend = async (id) => { await suspendMember(id); fetchMembers(); };
  const handleReactivate = async (id) => { await reactivateMember(id); fetchMembers(); };

  if (view === 'form') return <MemberForm member={selectedMember} goBack={() => { setView('list'); fetchMembers(); }} />;
  if (view === 'ledger') return <MemberLedger member={selectedMember} goBack={() => setView('list')} />;

  return (
    <div>
      <h1>Members List</h1>
      <button onClick={() => { setSelectedMember(null); setView('form'); }}>+ Register Member</button>
      <table>
        <thead>
          <tr><th>Name</th><th>Phone</th><th>Role</th><th>Balance</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {members.map(m => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{m.phone}</td>
              <td>{m.role}</td>
              <td>{m.balance}</td>
              <td>{m.active ? 'Active' : 'Suspended'}</td>
              <td>
                <button onClick={() => { setSelectedMember(m); setView('ledger'); }}>Ledger</button>
                <button onClick={() => { setSelectedMember(m); setView('form'); }}>Edit</button>
                {m.active ? <button onClick={() => handleSuspend(m.id)}>Suspend</button> :
                            <button onClick={() => handleReactivate(m.id)}>Reactivate</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

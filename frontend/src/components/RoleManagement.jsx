import React, { useState, useEffect } from 'react';
import { PERMISSIONS, getPermissionsByModule, DEFAULT_ROLES } from '../constants/permissions';
import { financeAPI } from './members/financeAPI';
import '../styles/role-management.css';

const RoleManagement = () => {
  const [roles, setRoles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    permissions: [],
  });
  const [selectedModules, setSelectedModules] = useState({});
  const [mutedRoles, setMutedRoles] = useState({});
  const [showMuteManager, setShowMuteManager] = useState(false);

  const permissionsByModule = getPermissionsByModule();

  const loadRoles = async () => {
    try {
      const res = await financeAPI.get('/settings/group-roles');
      setRoles(res.data || []);
    } catch (err) {
      console.error('Failed to load roles:', err);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const handleAddRole = () => {
    setFormData({
      name: '',
      description: '',
      permissions: [],
    });
    setSelectedModules({});
    setEditingRoleId(null);
    setShowForm(true);
  };

  const handleEditRole = (role) => {
    setFormData({
      name: role.name,
      description: role.description,
      permissions: role.permissions || [],
    });
    initializeModuleSelection(role.permissions || []);
    setEditingRoleId(role.id);
    setShowForm(true);
  };

  const initializeModuleSelection = (permissions) => {
    const modules = {};
    Object.keys(permissionsByModule).forEach(module => {
      modules[module] = {
        all: false,
        permissions: permissionsByModule[module].reduce((acc, perm) => {
          acc[perm.key] = permissions.includes(perm.key);
          return acc;
        }, {}),
      };
      // Check if all permissions in module are selected
      const modulePerms = permissionsByModule[module].map(p => p.key);
      modules[module].all = modulePerms.every(p => permissions.includes(p));
    });
    setSelectedModules(modules);
  };

  const handlePermissionToggle = (permissionKey) => {
    const newPermissions = formData.permissions.includes(permissionKey)
      ? formData.permissions.filter(p => p !== permissionKey)
      : [...formData.permissions, permissionKey];

    setFormData({ ...formData, permissions: newPermissions });

    // Update module selection state
    const [module] = permissionKey.split('.');
    const modulePerms = permissionsByModule[module].map(p => p.key);
    const allSelected = modulePerms.every(p => newPermissions.includes(p));

    setSelectedModules({
      ...selectedModules,
      [module]: {
        ...selectedModules[module],
        permissions: {
          ...selectedModules[module].permissions,
          [permissionKey]: !selectedModules[module].permissions[permissionKey],
        },
        all: allSelected,
      },
    });
  };

  const handleModuleToggle = (module) => {
    const modulePerms = permissionsByModule[module].map(p => p.key);
    const shouldSelectAll = !selectedModules[module]?.all;

    const newPermissions = shouldSelectAll
      ? [...new Set([...formData.permissions, ...modulePerms])]
      : formData.permissions.filter(p => !modulePerms.includes(p));

    setFormData({ ...formData, permissions: newPermissions });

    setSelectedModules({
      ...selectedModules,
      [module]: {
        ...selectedModules[module],
        all: shouldSelectAll,
        permissions: permissionsByModule[module].reduce((acc, perm) => {
          acc[perm.key] = shouldSelectAll;
          return acc;
        }, {}),
      },
    });
  };

  const handleSaveRole = async () => {
    try {
      if (!formData.name || !formData.name.trim()) {
        alert('Role name is required');
        return;
      }

      const payload = {
        name: formData.name.trim(),
        description: (formData.description || '').trim(),
        permissions: formData.permissions,
      };

      if (editingRoleId) {
        await financeAPI.patch(`/settings/group-roles/${editingRoleId}`, payload);
        alert('Role updated successfully');
      } else {
        await financeAPI.post('/settings/group-roles', payload);
        alert('Role created successfully');
      }

      loadRoles();
      setShowForm(false);
    } catch (err) {
      console.error('Failed to save role:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const handleDeleteRole = async (id) => {
    if (!confirm('Are you sure you want to delete this role?')) return;

    try {
      await financeAPI.delete(`/settings/group-roles/${id}`);
      alert('Role deleted successfully');
      loadRoles();
    } catch (err) {
      console.error('Failed to delete role:', err);
      alert(`Error: ${err.message}`);
    }
  };

  const handleMuteRole = (roleId) => {
    setMutedRoles({
      ...mutedRoles,
      [roleId]: !mutedRoles[roleId],
    });
  };

  const getPermissionLabel = (permissionKey) => {
    const [module, perm] = permissionKey.split('.');
    return PERMISSIONS[module]?.[perm] || permissionKey;
  };

  return (
    <div className="role-management">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>👥 Role Management</h2>
        <div>
          <button className="btn-add" onClick={handleAddRole} style={{ marginRight: '10px' }}>
            + Add New Role
          </button>
          <button className="btn-secondary" onClick={() => setShowMuteManager(!showMuteManager)}>
            🔇 Mute Settings
          </button>
        </div>
      </div>

      {/* ROLES TABLE */}
      <div className="roles-table-container">
        <table className="roles-table">
          <thead>
            <tr>
              <th>Role Name</th>
              <th>Description</th>
              <th>Permissions</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(role => (
              <tr key={role.id} className={mutedRoles[role.id] ? 'muted-role' : ''}>
                <td>
                  <strong>{role.name}</strong>
                </td>
                <td>{role.description || '-'}</td>
                <td>
                  <span className="permission-badge">
                    {role.permissions ? role.permissions.length : 0} permissions
                  </span>
                </td>
                <td>
                  {mutedRoles[role.id] ? (
                    <span className="status-muted">🔇 Muted in Views</span>
                  ) : (
                    <span className="status-active">✓ Active</span>
                  )}
                </td>
                <td>
                  <button className="btn-small btn-edit" onClick={() => handleEditRole(role)}>
                    Edit
                  </button>
                  <button
                    className="btn-small btn-mute"
                    onClick={() => handleMuteRole(role.id)}
                    title={mutedRoles[role.id] ? 'Unmute' : 'Mute'}
                  >
                    {mutedRoles[role.id] ? '🔔' : '🔇'}
                  </button>
                  <button className="btn-small btn-delete" onClick={() => handleDeleteRole(role.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* EDIT/CREATE FORM */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content role-form" onClick={e => e.stopPropagation()}>
            <h3>{editingRoleId ? '✏️ Edit Role' : '➕ Add New Role'}</h3>

            <div className="form-section">
              <div className="form-group">
                <label>Role Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Treasurer, Secretary"
                  required
                />
              </div>

              <div className="form-group full-width">
                <label>Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Role responsibilities and access level"
                  rows={3}
                />
              </div>
            </div>

            {/* PERMISSIONS CHECKLIST */}
            <div className="permissions-section">
              <h4>📋 Permissions</h4>
              <p className="permission-hint">Select permissions this role can perform:</p>

              {Object.keys(permissionsByModule).map(module => (
                <div key={module} className="permission-module">
                  <div className="module-header">
                    <label className="module-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedModules[module]?.all || false}
                        onChange={() => handleModuleToggle(module)}
                      />
                      <strong>{module}</strong>
                    </label>
                    <span className="module-count">
                      {selectedModules[module]?.all
                        ? permissionsByModule[module].length
                        : Object.values(selectedModules[module]?.permissions || {}).filter(Boolean).length}
                      /{permissionsByModule[module].length}
                    </span>
                  </div>

                  <div className="permissions-list">
                    {permissionsByModule[module].map(perm => (
                      <label key={perm.key} className="permission-item">
                        <input
                          type="checkbox"
                          checked={formData.permissions.includes(perm.key)}
                          onChange={() => handlePermissionToggle(perm.key)}
                        />
                        <span>{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button className="btn-save" onClick={handleSaveRole}>
                Save Role
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MUTE SETTINGS */}
      {showMuteManager && (
        <div className="mute-manager">
          <h4>🔇 Mute Roles in Views</h4>
          <p className="mute-help">
            Muted roles will be hidden from selection dropdowns and view filters across the system.
            Admin and other authorized users can still unmute them.
          </p>
          <div className="mute-list">
            {roles.map(role => (
              <div key={role.id} className="mute-item">
                <label>
                  <input
                    type="checkbox"
                    checked={mutedRoles[role.id] || false}
                    onChange={() => handleMuteRole(role.id)}
                  />
                  <span>{role.name}</span>
                  {mutedRoles[role.id] && <span className="mute-badge">Muted</span>}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagement;

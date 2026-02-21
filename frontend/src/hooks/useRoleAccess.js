import { useState, useCallback, useEffect } from 'react';
import { hasPermission, hasAnyPermission, hasAllPermissions } from '../constants/permissions';

/**
 * Hook for role-based access control
 * Usage: const { can, canView } = useRoleAccess(userPermissions)
 */
export const useRoleAccess = (userPermissions = []) => {
  const [permissions, setPermissions] = useState(userPermissions);

  useEffect(() => {
    setPermissions(userPermissions);
  }, [userPermissions]);

  // Check single permission
  const can = useCallback(
    (permission) => hasPermission(permissions, permission),
    [permissions]
  );

  // Check multiple permissions (any of them)
  const canAny = useCallback(
    (permissionList) => hasAnyPermission(permissions, permissionList),
    [permissions]
  );

  // Check multiple permissions (all of them)
  const canAll = useCallback(
    (permissionList) => hasAllPermissions(permissions, permissionList),
    [permissions]
  );

  // View permission checks
  const canView = useCallback((module) => can(`${module}.VIEW`) || can(`${module}.VIEW_ALL`), [can]);
  const canCreate = useCallback((module) => can(`${module}.CREATE`), [can]);
  const canEdit = useCallback((module) => can(`${module}.EDIT`), [can]);
  const canDelete = useCallback((module) => can(`${module}.DELETE`), [can]);
  const canApprove = useCallback((module) => can(`${module}.APPROVE`), [can]);

  // Admin checks
  const isAdmin = useCallback(
    () => can('ADMIN.MANAGE_ROLES') || can('ADMIN.SYSTEM_SETTINGS'),
    [can]
  );

  return {
    can,
    canAny,
    canAll,
    canView,
    canCreate,
    canEdit,
    canDelete,
    canApprove,
    isAdmin,
  };
};

/**
 * Component wrapper to restrict rendering based on permissions
 * Usage: <ProtectedComponent permission="MEMBERS.VIEW">...</ProtectedComponent>
 */
export const ProtectedComponent = ({ permission, permissions, children, fallback = null }) => {
  if (!hasPermission(permissions, permission)) {
    return fallback;
  }
  return children;
};

/**
 * Hook to get filtered list based on permissions and muted roles
 */
export const useFilteredRoles = (allRoles = [], mutedRoles = {}) => {
  return allRoles.filter(role => !mutedRoles[role.id]);
};

export default useRoleAccess;

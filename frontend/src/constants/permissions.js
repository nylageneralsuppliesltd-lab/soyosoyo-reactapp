/**
 * Permissions System - Defines all available permissions in the application
 * Structure: { module: { permission: 'friendly_name' } }
 */

export const PERMISSIONS = {
  // ADMIN - System-wide administrative permissions
  ADMIN: {
    MANAGE_ROLES: 'Manage Roles & Permissions',
    MANAGE_USERS: 'Manage Users',
    VIEW_AUDIT_LOG: 'View Audit Log',
    SYSTEM_SETTINGS: 'Manage System Settings',
    MANAGE_MUTES: 'Mute/Unmute Roles in Views',
  },

  // MEMBERS - Member management
  MEMBERS: {
    VIEW_ALL: 'View All Members',
    CREATE: 'Create Member',
    EDIT: 'Edit Member',
    DELETE: 'Delete Member',
    VIEW_PROFILE: 'View Member Profile',
    EXPORT: 'Export Members',
  },

  // DEPOSITS - Deposit handling
  DEPOSITS: {
    VIEW: 'View Deposits',
    CREATE: 'Create Deposit',
    APPROVE: 'Approve Deposit',
    REJECT: 'Reject Deposit',
    EDIT_OWN: 'Edit Own Deposits',
    DELETE: 'Delete Deposit',
    EXPORT: 'Export Deposits',
  },

  // WITHDRAWALS - Withdrawal handling
  WITHDRAWALS: {
    VIEW: 'View Withdrawals',
    CREATE: 'Create Withdrawal',
    APPROVE: 'Approve Withdrawal',
    REJECT: 'Reject Withdrawal',
    EDIT_OWN: 'Edit Own Withdrawals',
    DELETE: 'Delete Withdrawal',
    EXPORT: 'Export Withdrawals',
  },

  // LOANS - Loan management
  LOANS: {
    VIEW_ALL: 'View All Loans',
    CREATE: 'Create Loan',
    APPROVE: 'Approve Loan',
    DISBURSE: 'Disburse Loan',
    EDIT: 'Edit Loan',
    DELETE: 'Delete Loan',
    VIEW_FINE_LEDGER: 'View Fine Ledger',
    COLLECT_FINE: 'Collect Fine',
    EXPORT: 'Export Loans',
  },

  // REPORTS - Financial reporting
  REPORTS: {
    VIEW_BALANCE_SHEET: 'View Balance Sheet',
    VIEW_INCOME_STATEMENT: 'View Income Statement',
    VIEW_CASH_FLOW: 'View Cash Flow Statement',
    VIEW_TRIAL_BALANCE: 'View Trial Balance',
    VIEW_GENERAL_LEDGER: 'View General Ledger',
    VIEW_MEMBER_STATEMENTS: 'View Member Statements',
    EXPORT_REPORTS: 'Export Reports',
    VIEW_ALL: 'View All Reports',
  },

  // ACCOUNTS - Chart of accounts & ledger
  ACCOUNTS: {
    VIEW: 'View Accounts',
    CREATE: 'Create Account',
    EDIT: 'Edit Account',
    DELETE: 'Delete Account',
    VIEW_LEDGER: 'View Account Ledger',
  },

  // SETTINGS - Configuration
  SETTINGS: {
    VIEW_SETTINGS: 'View Settings',
    MANAGE_CONTRIBUTIONS: 'Manage Contribution Types',
    MANAGE_EXPENSES: 'Manage Expense Categories',
    MANAGE_INCOME: 'Manage Income Categories',
    MANAGE_FINES: 'Manage Fine Types',
    MANAGE_INVOICES: 'Manage Invoice Templates',
    MANAGE_ACCOUNTS: 'Manage Accounts',
    MANAGE_ASSETS: 'Manage Assets',
  },

  // DASHBOARD
  DASHBOARD: {
    VIEW: 'View Dashboard',
    VIEW_SUMMARY: 'View Summary Statistics',
    VIEW_TRANSACTIONS: 'View Recent Transactions',
  },
};

// Role definitions with default permissions
export const DEFAULT_ROLES = {
  ADMIN: {
    name: 'Admin',
    description: 'System administrator - full access to all features',
    permissions: Object.values(PERMISSIONS)
      .flatMap(module => Object.keys(module))
      .map(perm => `ADMIN.${perm}`)
      .concat(
        Object.keys(PERMISSIONS).flatMap(module =>
          Object.keys(PERMISSIONS[module]).map(perm => `${module}.${perm}`)
        )
      ),
    isSuperRole: true,
    canMuteRoles: true,
  },

  TREASURER: {
    name: 'Treasurer',
    description: 'Manages finances, approves withdrawals and loans',
    permissions: [
      'MEMBERS.VIEW_ALL',
      'MEMBERS.VIEW_PROFILE',
      'DEPOSITS.VIEW',
      'DEPOSITS.CREATE',
      'DEPOSITS.APPROVE',
      'WITHDRAWALS.VIEW',
      'WITHDRAWALS.APPROVE',
      'WITHDRAWALS.REJECT',
      'WITHDRAWALS.DELETE',
      'LOANS.VIEW_ALL',
      'LOANS.APPROVE',
      'LOANS.DISBURSE',
      'LOANS.VIEW_FINE_LEDGER',
      'REPORTS.VIEW_BALANCE_SHEET',
      'REPORTS.VIEW_GENERAL_LEDGER',
      'ACCOUNTS.VIEW',
      'ACCOUNTS.VIEW_LEDGER',
      'DASHBOARD.VIEW',
    ],
    isSuperRole: false,
    canMuteRoles: false,
  },

  SECRETARY: {
    name: 'Secretary',
    description: 'Manages members and maintains records',
    permissions: [
      'MEMBERS.VIEW_ALL',
      'MEMBERS.CREATE',
      'MEMBERS.EDIT',
      'MEMBERS.VIEW_PROFILE',
      'DEPOSITS.VIEW',
      'WITHDRAWALS.VIEW',
      'LOANS.VIEW_ALL',
      'REPORTS.VIEW_MEMBER_STATEMENTS',
      'DASHBOARD.VIEW',
    ],
    isSuperRole: false,
    canMuteRoles: false,
  },

  ACCOUNTANT: {
    name: 'Accountant',
    description: 'Manages accounts and generates financial statements',
    permissions: [
      'MEMBERS.VIEW_ALL',
      'DEPOSITS.VIEW',
      'WITHDRAWALS.VIEW',
      'LOANS.VIEW_ALL',
      'REPORTS.VIEW_ALL',
      'ACCOUNTS.VIEW',
      'ACCOUNTS.CREATE',
      'ACCOUNTS.EDIT',
      'ACCOUNTS.VIEW_LEDGER',
      'DASHBOARD.VIEW',
      'DASHBOARD.VIEW_SUMMARY',
      'SETTINGS.VIEW_SETTINGS',
    ],
    isSuperRole: false,
    canMuteRoles: false,
  },

  MEMBER: {
    name: 'Member',
    description: 'Regular member - can view own information',
    permissions: [
      'MEMBERS.VIEW_PROFILE',
      'DASHBOARD.VIEW',
      'REPORTS.VIEW_MEMBER_STATEMENTS',
    ],
    isSuperRole: false,
    canMuteRoles: false,
  },

  GUEST: {
    name: 'Guest',
    description: 'Limited read-only access',
    permissions: ['DASHBOARD.VIEW'],
    isSuperRole: false,
    canMuteRoles: false,
  },
};

/**
 * Check if a role has a specific permission
 */
export const hasPermission = (userPermissions, requiredPermission) => {
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  return userPermissions.includes(requiredPermission);
};

/**
 * Check if user has any of the provided permissions
 */
export const hasAnyPermission = (userPermissions, requiredPermissions) => {
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  return requiredPermissions.some(perm => userPermissions.includes(perm));
};

/**
 * Check if user has all of the provided permissions
 */
export const hasAllPermissions = (userPermissions, requiredPermissions) => {
  if (!userPermissions || !Array.isArray(userPermissions)) return false;
  return requiredPermissions.every(perm => userPermissions.includes(perm));
};

/**
 * Get flattened list of all permissions
 */
export const getAllPermissions = () => {
  const allPerms = [];
  Object.keys(PERMISSIONS).forEach(module => {
    Object.keys(PERMISSIONS[module]).forEach(perm => {
      allPerms.push({
        key: `${module}.${perm}`,
        module,
        permission: perm,
        label: PERMISSIONS[module][perm],
      });
    });
  });
  return allPerms;
};

/**
 * Get permissions grouped by module
 */
export const getPermissionsByModule = () => {
  const grouped = {};
  Object.keys(PERMISSIONS).forEach(module => {
    grouped[module] = Object.keys(PERMISSIONS[module]).map(perm => ({
      key: `${module}.${perm}`,
      module,
      permission: perm,
      label: PERMISSIONS[module][perm],
    }));
  });
  return grouped;
};

export default PERMISSIONS;

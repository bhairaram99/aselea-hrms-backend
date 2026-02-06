/**
 * PERMISSION UTILITIES - Helper functions for authorization checks
 * 
 * WHY: Centralized permission logic that can be reused across services,
 * controllers, and middleware for consistent authorization enforcement.
 */

const { ROLES, ROLE_HIERARCHY } = require('../constants');

/**
 * Check if user has minimum required role level
 * @param {string} userRole - Current user's role
 * @param {string} requiredRole - Minimum required role
 * @returns {boolean}
 */
const hasMinimumRole = (userRole, requiredRole) => {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
};

/**
 * Check if user's role is higher than another role
 * @param {string} userRole - Current user's role
 * @param {string} targetRole - Role to compare against
 * @returns {boolean}
 */
const hasHigherRole = (userRole, targetRole) => {
  const userLevel = ROLE_HIERARCHY[userRole] || 0;
  const targetLevel = ROLE_HIERARCHY[targetRole] || 0;
  return userLevel > targetLevel;
};

/**
 * Check if user can manage another user based on role hierarchy
 * @param {string} managerRole - Role of the person trying to manage
 * @param {string} targetRole - Role of the target user
 * @returns {boolean}
 */
const canManageRole = (managerRole, targetRole) => {
  // Admin can manage all roles
  if (managerRole === ROLES.ADMIN) {
    return true;
  }
  
  // HR can manage employees but not other HR or admins
  if (managerRole === ROLES.HR) {
    return targetRole === ROLES.EMPLOYEE;
  }
  
  // Employees cannot manage anyone
  return false;
};

/**
 * Check if user belongs to same company as resource
 * @param {ObjectId} userCompanyId - User's company ID
 * @param {ObjectId} resourceCompanyId - Resource's company ID
 * @returns {boolean}
 */
const isSameCompany = (userCompanyId, resourceCompanyId) => {
  if (!userCompanyId || !resourceCompanyId) {
    return false;
  }
  return userCompanyId.toString() === resourceCompanyId.toString();
};

/**
 * Check if user is owner of resource
 * @param {ObjectId} userId - User's ID
 * @param {ObjectId} resourceOwnerId - Resource owner's ID
 * @returns {boolean}
 */
const isOwner = (userId, resourceOwnerId) => {
  if (!userId || !resourceOwnerId) {
    return false;
  }
  return userId.toString() === resourceOwnerId.toString();
};

/**
 * Check if user can access resource (owner OR higher role)
 * @param {Object} user - User object with _id and role
 * @param {ObjectId} resourceOwnerId - Resource owner's ID
 * @returns {boolean}
 */
const canAccessResource = (user, resourceOwnerId) => {
  // Admin and HR can access all resources in their company
  if (user.role === ROLES.ADMIN || user.role === ROLES.HR) {
    return true;
  }
  
  // Employee can only access their own resources
  return isOwner(user._id, resourceOwnerId);
};

/**
 * Check if user can modify resource
 * @param {Object} user - User object with _id and role
 * @param {Object} resource - Resource object with user/owner field
 * @param {string} ownerField - Name of the field that contains owner ID (default: 'user')
 * @returns {boolean}
 */
const canModifyResource = (user, resource, ownerField = 'user') => {
  // Admin can modify all
  if (user.role === ROLES.ADMIN) {
    return true;
  }
  
  // HR can modify resources in their company
  if (user.role === ROLES.HR) {
    return true;
  }
  
  // Employee can only modify their own resources
  const ownerId = resource[ownerField];
  return isOwner(user._id, ownerId);
};

/**
 * Check if user can delete resource
 * @param {Object} user - User object with _id and role
 * @param {Object} resource - Resource object
 * @param {Object} options - Additional options
 * @returns {boolean}
 */
const canDeleteResource = (user, resource, options = {}) => {
  const { requireOwnership = false, ownerField = 'user' } = options;
  
  // Admin can delete all
  if (user.role === ROLES.ADMIN && !requireOwnership) {
    return true;
  }
  
  // HR can delete resources in their company (unless requiring ownership)
  if (user.role === ROLES.HR && !requireOwnership) {
    return true;
  }
  
  // Check ownership
  const ownerId = resource[ownerField];
  return isOwner(user._id, ownerId);
};

/**
 * Check if user can approve/reject requests
 * @param {string} userRole - User's role
 * @returns {boolean}
 */
const canApproveRequests = (userRole) => {
  return userRole === ROLES.ADMIN || userRole === ROLES.HR;
};

/**
 * Check if user has specific permission
 * @param {string} userRole - User's role
 * @param {string} permission - Permission name
 * @returns {boolean}
 */
const hasPermission = (userRole, permission) => {
  // Define permission matrix
  const permissions = {
    'manage_attendance': [ROLES.ADMIN, ROLES.HR],
    'approve_leaves': [ROLES.ADMIN, ROLES.HR],
    'manage_tasks': [ROLES.ADMIN, ROLES.HR],
    'approve_expenses': [ROLES.ADMIN, ROLES.HR],
    'manage_users': [ROLES.ADMIN, ROLES.HR],
    'view_analytics': [ROLES.ADMIN, ROLES.HR],
    'manage_company': [ROLES.ADMIN],
    'export_data': [ROLES.ADMIN, ROLES.HR],
    'delete_users': [ROLES.ADMIN],
    'manage_announcements': [ROLES.ADMIN, ROLES.HR],
    'view_all_expenses': [ROLES.ADMIN, ROLES.HR],
    'view_all_tasks': [ROLES.ADMIN, ROLES.HR],
    'mark_attendance_manually': [ROLES.ADMIN, ROLES.HR]
  };
  
  const allowedRoles = permissions[permission] || [];
  return allowedRoles.includes(userRole);
};

/**
 * Get permission level for a user
 * @param {string} userRole - User's role
 * @returns {number} Permission level (higher is more privileged)
 */
const getPermissionLevel = (userRole) => {
  return ROLE_HIERARCHY[userRole] || 0;
};

/**
 * Validate company access
 * @param {Object} user - User object with company field
 * @param {Object} resource - Resource object with company field
 * @param {boolean} allowAdminCrossCompany - Allow admin to access other companies
 * @returns {boolean}
 */
const validateCompanyAccess = (user, resource, allowAdminCrossCompany = false) => {
  // Admin can access cross-company if allowed
  if (allowAdminCrossCompany && user.role === ROLES.ADMIN) {
    return true;
  }
  
  // Check if same company
  return isSameCompany(user.company, resource.company);
};

/**
 * Check if action is allowed based on user role and resource state
 * @param {Object} user - User object
 * @param {string} action - Action name (create, read, update, delete, approve, etc.)
 * @param {Object} resource - Resource object
 * @param {Object} context - Additional context
 * @returns {boolean}
 */
const isActionAllowed = (user, action, resource = null, context = {}) => {
  const { resourceType, requireOwnership = false } = context;
  
  // Admin can do everything (unless specifically restricted)
  if (user.role === ROLES.ADMIN && !requireOwnership) {
    return true;
  }
  
  switch (action) {
    case 'create':
      return true; // All authenticated users can create resources
      
    case 'read':
      if (user.role === ROLES.HR) return true;
      return resource ? canAccessResource(user, resource.user || resource.owner) : true;
      
    case 'update':
      if (user.role === ROLES.HR) return true;
      return resource ? canModifyResource(user, resource) : false;
      
    case 'delete':
      return resource ? canDeleteResource(user, resource, { requireOwnership }) : false;
      
    case 'approve':
    case 'reject':
      return canApproveRequests(user.role);
      
    default:
      return false;
  }
};

module.exports = {
  hasMinimumRole,
  hasHigherRole,
  canManageRole,
  isSameCompany,
  isOwner,
  canAccessResource,
  canModifyResource,
  canDeleteResource,
  canApproveRequests,
  hasPermission,
  getPermissionLevel,
  validateCompanyAccess,
  isActionAllowed
};

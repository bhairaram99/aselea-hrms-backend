/**
 * ROLE MIDDLEWARE - Role hierarchy and permission enforcement
 * 
 * WHY: Provides advanced role-based access control beyond simple role checking.
 * Implements role hierarchy (Admin > HR > Employee) and permission-based authorization.
 */

const { ROLES, ROLE_HIERARCHY, HTTP_STATUS, ERROR_MESSAGES } = require('../constants');

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
 * Middleware: Require minimum role level
 * Usage: requireMinimumRole('hr') - requires HR or Admin
 */
exports.requireMinimumRole = (minimumRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: ERROR_MESSAGES.UNAUTHORIZED
      });
    }
    
    if (!hasMinimumRole(req.user.role, minimumRole)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: `This action requires ${minimumRole} role or higher`
      });
    }
    
    next();
  };
};

/**
 * Middleware: Ensure user can manage target user
 * Checks role hierarchy before allowing user management actions
 */
exports.canManageUser = async (req, res, next) => {
  try {
    const managerRole = req.user.role;
    
    // Get target user's role from request body or params
    let targetUserId = req.params.userId || req.body.userId || req.params.id;
    
    if (!targetUserId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Target user ID is required'
      });
    }
    
    // Fetch target user to check their role
    const User = require('../models/User.model');
    const targetUser = await User.findById(targetUserId);
    
    if (!targetUser) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Target user not found'
      });
    }
    
    // Check company isolation (except for admins)
    if (managerRole !== ROLES.ADMIN) {
      if (targetUser.company?.toString() !== req.user.company?.toString()) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({
          success: false,
          message: ERROR_MESSAGES.COMPANY_ACCESS_DENIED
        });
      }
    }
    
    // Check if can manage this role
    if (!canManageRole(managerRole, targetUser.role)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: `You cannot manage users with ${targetUser.role} role`
      });
    }
    
    // Attach target user to request for use in controller
    req.targetUser = targetUser;
    next();
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Error checking user management permissions',
      error: error.message
    });
  }
};

/**
 * Middleware: Ensure user owns the resource or has higher role
 * Use for endpoints where users can only access their own data unless they're HR/Admin
 */
exports.ownerOrHigherRole = (resourceField = 'user') => {
  return async (req, res, next) => {
    try {
      const userRole = req.user.role;
      const userId = req.user._id;
      
      // Admin and HR bypass ownership check
      if (userRole === ROLES.ADMIN || userRole === ROLES.HR) {
        return next();
      }
      
      // Get resource ID from params or query
      const resourceId = req.params.id || req.query.id;
      
      if (!resourceId) {
        // If no resource ID, check if creating new resource (allow)
        return next();
      }
      
      // This will be completed in the controller if needed
      // For now, allow and let controller handle specific ownership checks
      next();
    } catch (error) {
      res.status(HTTP_STATUS.SERVER_ERROR).json({
        success: false,
        message: 'Error checking resource ownership',
        error: error.message
      });
    }
  };
};

/**
 * Middleware: Check if user has specific permission
 * @param {string} permission - Permission name (e.g., 'manage_attendance', 'approve_leaves')
 */
exports.hasPermission = (permission) => {
  return (req, res, next) => {
    const userRole = req.user.role;
    
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
      'delete_users': [ROLES.ADMIN]
    };
    
    const allowedRoles = permissions[permission] || [];
    
    if (!allowedRoles.includes(userRole)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: `Permission denied: ${permission} required`
      });
    }
    
    next();
  };
};

/**
 * Helper functions exported for use in services
 */
module.exports.helpers = {
  hasMinimumRole,
  hasHigherRole,
  canManageRole
};

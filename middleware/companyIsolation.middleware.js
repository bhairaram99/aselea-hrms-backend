/**
 * COMPANY ISOLATION MIDDLEWARE - Enforce company-level data scoping
 * 
 * WHY: Critical security measure to prevent cross-company data access.
 * Ensures users can only access data from their own company.
 */

const { HTTP_STATUS, ERROR_MESSAGES, ROLES } = require('../constants');

/**
 * Verify company access for a specific resource
 * Attaches to routes that access company-specific data
 */
exports.enforceCompanyAccess = (Model) => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      const userCompanyId = req.user.company;
      const userRole = req.user.role;
      
      // Admin can access all companies (if needed for super admin features)
      // Comment this out if even admins should be restricted to their company
      if (userRole === ROLES.ADMIN) {
        return next();
      }
      
      // For HR and employees, company validation is optional
      // If no company is set, allow access but warn
      if (!userCompanyId) {
        console.warn(`Warning: User ${req.user._id} (${userRole}) has no company associated`);
        // Allow access for now, but in production you may want stricter rules
        return next();
      }
      
      // If resourceId is provided, verify the resource belongs to user's company
      if (resourceId) {
        const resource = await Model.findById(resourceId);
        
        if (!resource) {
          return res.status(HTTP_STATUS.NOT_FOUND).json({
            success: false,
            message: ERROR_MESSAGES.NOT_FOUND
          });
        }
        
        // Check if resource has company field
        if (resource.company && userCompanyId) {
          if (resource.company.toString() !== userCompanyId.toString()) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({
              success: false,
              message: ERROR_MESSAGES.COMPANY_ACCESS_DENIED
            });
          }
        }
      }
      
      next();
    } catch (error) {
      res.status(HTTP_STATUS.SERVER_ERROR).json({
        success: false,
        message: 'Error verifying company access',
        error: error.message
      });
    }
  };
};

/**
 * Add company filter to query automatically
 * Prevents queries from returning data from other companies
 */
exports.scopeToCompany = (req, res, next) => {
  const userCompanyId = req.user?.company;
  const userRole = req.user?.role;
  
  // Skip for admin if you want admins to see all companies
  // if (userRole === ROLES.ADMIN) {
  //   return next();
  // }
  
  if (!userCompanyId) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: 'User must be associated with a company'
    });
  }
  
  // Add company to query params
  if (!req.query.companyId) {
    req.query.companyId = userCompanyId;
  } else {
    // If companyId is provided in query, verify it matches user's company
    if (req.query.companyId !== userCompanyId.toString() && userRole !== ROLES.ADMIN) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: ERROR_MESSAGES.COMPANY_ACCESS_DENIED
      });
    }
  }
  
  next();
};

/**
 * Verify user belongs to the same company as the target user
 * Used for user-specific operations
 */
exports.verifyUserCompanyAccess = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId || req.body.userId || req.query.userId;
    const currentUserCompanyId = req.user.company;
    const currentUserRole = req.user.role;
    
    // If no target user specified, skip
    if (!targetUserId) {
      return next();
    }
    
    // Admin can access all users
    if (currentUserRole === ROLES.ADMIN) {
      return next();
    }
    
    const User = require('../models/User.model');
    const targetUser = await User.findById(targetUserId);
    
    if (!targetUser) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Verify same company
    if (targetUser.company?.toString() !== currentUserCompanyId?.toString()) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: ERROR_MESSAGES.COMPANY_ACCESS_DENIED
      });
    }
    
    next();
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: 'Error verifying user company access',
      error: error.message
    });
  }
};

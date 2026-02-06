/**
 * VALIDATION MIDDLEWARE - Request data validation
 * 
 * WHY: Validates incoming request data before processing,
 * prevents invalid data from reaching controllers/services.
 */

const { HTTP_STATUS, LEAVE_TYPES, EXPENSE_CATEGORY, TASK_PRIORITY } = require('../constants');

/**
 * Validate required fields
 */
const validateRequiredFields = (fields) => {
  return (req, res, next) => {
    const missing = [];
    
    fields.forEach(field => {
      if (!req.body[field]) {
        missing.push(field);
      }
    });
    
    if (missing.length > 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }
    
    next();
  };
};

/**
 * Validate leave request data
 */
exports.validateLeaveRequest = (req, res, next) => {
  const { leaveType, startDate, endDate, reason } = req.body;
  
  const errors = [];
  
  if (!leaveType) errors.push('Leave type is required');
  if (!startDate) errors.push('Start date is required');
  if (!endDate) errors.push('End date is required');
  if (!reason) errors.push('Reason is required');
  
  // Validate leave type
  if (leaveType && !Object.values(LEAVE_TYPES).includes(leaveType)) {
    errors.push('Invalid leave type');
  }
  
  // Validate dates
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime())) errors.push('Invalid start date');
    if (isNaN(end.getTime())) errors.push('Invalid end date');
    
    if (start > end) {
      errors.push('End date must be after start date');
    }
    
    // Don't allow past dates (except for today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start < today) {
      errors.push('Cannot request leave for past dates');
    }
  }
  
  if (errors.length > 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Validate expense data
 */
exports.validateExpense = (req, res, next) => {
  const { category, amount, date, description } = req.body;
  
  const errors = [];
  
  if (!category) errors.push('Category is required');
  if (!amount) errors.push('Amount is required');
  if (!date) errors.push('Date is required');
  if (!description) errors.push('Description is required');
  
  // Validate category
  if (category && !Object.values(EXPENSE_CATEGORY).includes(category)) {
    errors.push('Invalid expense category');
  }
  
  // Validate amount
  if (amount !== undefined) {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      errors.push('Amount must be a positive number');
    }
  }
  
  // Validate date
  if (date) {
    const expenseDate = new Date(date);
    if (isNaN(expenseDate.getTime())) {
      errors.push('Invalid date');
    }
    
    // Don't allow future dates
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (expenseDate > today) {
      errors.push('Cannot create expense for future dates');
    }
  }
  
  if (errors.length > 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Validate task data
 */
exports.validateTask = (req, res, next) => {
  const { title, assignedTo } = req.body;
  
  const errors = [];
  
  if (!title) errors.push('Task title is required');
  if (!assignedTo) errors.push('Assigned to user ID is required');
  
  // Validate priority if provided
  if (req.body.priority && !Object.values(TASK_PRIORITY).includes(req.body.priority)) {
    errors.push('Invalid task priority');
  }
  
  // Validate due date if provided
  if (req.body.dueDate) {
    const dueDate = new Date(req.body.dueDate);
    if (isNaN(dueDate.getTime())) {
      errors.push('Invalid due date');
    }
  }
  
  // Validate progress if provided
  if (req.body.progress !== undefined) {
    const progress = parseInt(req.body.progress);
    if (isNaN(progress) || progress < 0 || progress > 100) {
      errors.push('Progress must be between 0 and 100');
    }
  }
  
  if (errors.length > 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Validation failed',
      errors
    });
  }
  
  next();
};

/**
 * Validate attendance check-in/check-out
 */
exports.validateAttendance = (req, res, next) => {
  const { location } = req.body;
  
  // Location is optional but if provided, should have valid structure
  if (location) {
    if (location.latitude !== undefined && location.longitude !== undefined) {
      const lat = parseFloat(location.latitude);
      const lng = parseFloat(location.longitude);
      
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid location coordinates'
        });
      }
      
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Location coordinates out of valid range'
        });
      }
    }
  }
  
  next();
};

/**
 * Validate MongoDB ObjectId
 */
exports.validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    const mongoose = require('mongoose');
    const id = req.params[paramName];
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Invalid ${paramName}`
      });
    }
    
    next();
  };
};

/**
 * Validate date range query parameters
 */
exports.validateDateRange = (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Invalid date format'
      });
    }
    
    if (start > end) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Start date must be before end date'
      });
    }
  }
  
  next();
};

module.exports.validateRequiredFields = validateRequiredFields;

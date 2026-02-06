/**
 * CONSTANTS - Application-wide enumerations and constants
 * 
 * WHY: Centralized constants prevent typos, ensure consistency,
 * and make it easier to modify values across the application.
 */

// User Roles - Hierarchical permission system
const ROLES = {
  ADMIN: 'admin',      // Full system access, cross-company if needed
  HR: 'hr',            // Company-level HR management
  EMPLOYEE: 'employee' // Individual employee access
};

// Role hierarchy for permission checks
const ROLE_HIERARCHY = {
  admin: 3,    // Highest privilege
  hr: 2,       // Medium privilege
  employee: 1  // Base privilege
};

// User Status
const USER_STATUS = {
  ACTIVE: 'active',
  ON_LEAVE: 'on-leave',
  INACTIVE: 'inactive'
};

// Attendance Status
const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
  LATE: 'late',
  HALF_DAY: 'half-day',
  WORK_FROM_HOME: 'work-from-home'
};

// Leave Types
const LEAVE_TYPES = {
  SICK: 'sick',
  CASUAL: 'casual',
  ANNUAL: 'annual',
  MATERNITY: 'maternity',
  PATERNITY: 'paternity',
  UNPAID: 'unpaid'
};

// Leave Status
const LEAVE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled'
};

// Default Leave Balances (in days)
const DEFAULT_LEAVE_BALANCE = {
  annual: 21,     // 21 days annual leave
  sick: 14,       // 14 days sick leave
  casual: 7,      // 7 days casual leave
  maternity: 90,  // 90 days maternity leave
  paternity: 7,   // 7 days paternity leave
  unpaid: 0       // Unlimited unpaid leave (not deducted)
};

// Task Status
const TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Task Priority
const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

// Expense Category
const EXPENSE_CATEGORY = {
  TRAVEL: 'travel',
  FOOD: 'food',
  OFFICE_SUPPLIES: 'office-supplies',
  SOFTWARE: 'software',
  TRAINING: 'training',
  OTHER: 'other'
};

// Expense Status
const EXPENSE_STATUS = {
  DRAFT: 'draft',       // Not yet submitted
  PENDING: 'pending',   // Submitted for approval
  APPROVED: 'approved', // Approved by HR/Admin
  REJECTED: 'rejected', // Rejected
  PAID: 'paid'          // Payment completed
};

// Company Status
const COMPANY_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended'
};

// Company Size Options
const COMPANY_SIZE = {
  MICRO: '1-10',
  SMALL: '11-50',
  MEDIUM: '51-200',
  LARGE: '201-500',
  ENTERPRISE: '500+'
};

// Subscription Plans
const SUBSCRIPTION_PLANS = {
  FREE: 'free',
  BASIC: 'basic',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise'
};

// Business Rules - Working hours configuration
const BUSINESS_RULES = {
  STANDARD_WORK_HOURS: 8,        // Standard working hours per day
  HALF_DAY_HOURS: 4,             // Hours for half-day
  LATE_THRESHOLD_MINUTES: 15,    // Minutes after which marked as late
  GRACE_PERIOD_MINUTES: 5,       // Grace period for check-in
  WORK_WEEK_DAYS: 5,             // Working days per week
  MIN_CHECKOUT_HOURS: 4          // Minimum hours to complete checkout
};

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  SERVER_ERROR: 500
};

// Error Messages
const ERROR_MESSAGES = {
  // Authentication
  UNAUTHORIZED: 'Not authorized to access this route',
  INVALID_CREDENTIALS: 'Invalid credentials',
  TOKEN_EXPIRED: 'Token has expired',
  
  // Authorization
  FORBIDDEN: 'You do not have permission to perform this action',
  COMPANY_ACCESS_DENIED: 'Access denied: Cross-company data access not allowed',
  
  // Validation
  REQUIRED_FIELDS: 'Please provide all required fields',
  INVALID_DATE_RANGE: 'Invalid date range',
  INVALID_STATUS_TRANSITION: 'Invalid status transition',
  
  // Attendance
  DUPLICATE_ATTENDANCE: 'Attendance already recorded for this date',
  ALREADY_CHECKED_IN: 'Already checked in for today',
  NOT_CHECKED_IN: 'Must check in before checking out',
  INVALID_CHECKOUT: 'Invalid checkout time',
  
  // Leave
  INSUFFICIENT_BALANCE: 'Insufficient leave balance',
  OVERLAPPING_LEAVE: 'Leave dates overlap with existing leave request',
  CANNOT_MODIFY_APPROVED: 'Cannot modify approved leave',
  
  // Task
  TASK_NOT_FOUND: 'Task not found',
  CANNOT_DELETE_HR_TASK: 'Cannot delete tasks assigned by HR/Admin',
  
  // Expense
  EXPENSE_LOCKED: 'Cannot modify expense after approval/rejection',
  INVALID_RECEIPT: 'Valid receipt is required',
  
  // General
  NOT_FOUND: 'Resource not found',
  SERVER_ERROR: 'Server error occurred'
};

// Success Messages
const SUCCESS_MESSAGES = {
  // Attendance
  CHECKED_IN: 'Successfully checked in',
  CHECKED_OUT: 'Successfully checked out',
  
  // Leave
  LEAVE_REQUESTED: 'Leave request submitted successfully',
  LEAVE_APPROVED: 'Leave approved successfully',
  LEAVE_REJECTED: 'Leave rejected successfully',
  LEAVE_CANCELLED: 'Leave cancelled successfully',
  
  // Task
  TASK_CREATED: 'Task created successfully',
  TASK_UPDATED: 'Task updated successfully',
  TASK_DELETED: 'Task deleted successfully',
  
  // Expense
  EXPENSE_CREATED: 'Expense submitted successfully',
  EXPENSE_UPDATED: 'Expense updated successfully',
  EXPENSE_APPROVED: 'Expense approved successfully',
  EXPENSE_REJECTED: 'Expense rejected successfully'
};

module.exports = {
  ROLES,
  ROLE_HIERARCHY,
  USER_STATUS,
  ATTENDANCE_STATUS,
  LEAVE_TYPES,
  LEAVE_STATUS,
  DEFAULT_LEAVE_BALANCE,
  TASK_STATUS,
  TASK_PRIORITY,
  EXPENSE_CATEGORY,
  EXPENSE_STATUS,
  COMPANY_STATUS,
  COMPANY_SIZE,
  SUBSCRIPTION_PLANS,
  BUSINESS_RULES,
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
};

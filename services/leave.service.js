/**
 * LEAVE SERVICE - Business logic for leave management
 * 
 * WHY: Handles leave balance calculations, deductions, restorations,
 * and complex leave approval workflows. Ensures data integrity.
 */

const Leave = require('../models/Leave.model');
const User = require('../models/User.model');
const { 
  LEAVE_STATUS, 
  LEAVE_TYPES, 
  ERROR_MESSAGES,
  ROLES
} = require('../constants');

/**
 * Check for overlapping leave requests
 */
const hasOverlappingLeave = async (userId, startDate, endDate, excludeLeaveId = null) => {
  const query = {
    user: userId,
    status: { $in: [LEAVE_STATUS.PENDING, LEAVE_STATUS.APPROVED] },
    $or: [
      // New leave starts during existing leave
      {
        startDate: { $lte: new Date(startDate) },
        endDate: { $gte: new Date(startDate) }
      },
      // New leave ends during existing leave
      {
        startDate: { $lte: new Date(endDate) },
        endDate: { $gte: new Date(endDate) }
      },
      // New leave completely contains existing leave
      {
        startDate: { $gte: new Date(startDate) },
        endDate: { $lte: new Date(endDate) }
      }
    ]
  };
  
  if (excludeLeaveId) {
    query._id = { $ne: excludeLeaveId };
  }
  
  const overlapping = await Leave.findOne(query);
  return overlapping;
};

/**
 * Calculate number of days between dates (excluding weekends)
 */
const calculateLeaveDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let days = 0;
  const current = new Date(start);
  
  while (current <= end) {
    const dayOfWeek = current.getDay();
    // Count only weekdays (Monday = 1 to Friday = 5)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
};

/**
 * Check if user has sufficient leave balance
 */
const checkLeaveBalance = async (userId, leaveType, days) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // Unpaid leave is unlimited
  if (leaveType === LEAVE_TYPES.UNPAID) {
    return true;
  }
  
  const balance = user.leaveBalance[leaveType] || 0;
  
  if (balance < days) {
    return false;
  }
  
  return true;
};

/**
 * Deduct leave balance from user
 */
const deductLeaveBalance = async (userId, leaveType, days) => {
  // Don't deduct for unpaid leave
  if (leaveType === LEAVE_TYPES.UNPAID) {
    return;
  }
  
  const user = await User.findById(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  if (!user.leaveBalance[leaveType]) {
    user.leaveBalance[leaveType] = 0;
  }
  
  user.leaveBalance[leaveType] -= days;
  await user.save();
};

/**
 * Restore leave balance to user
 */
const restoreLeaveBalance = async (userId, leaveType, days) => {
  // Don't restore unpaid leave (it's unlimited)
  if (leaveType === LEAVE_TYPES.UNPAID) {
    return;
  }
  
  const user = await User.findById(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  if (!user.leaveBalance[leaveType]) {
    user.leaveBalance[leaveType] = 0;
  }
  
  user.leaveBalance[leaveType] += days;
  await user.save();
};

/**
 * Create leave request
 */
const createLeaveRequest = async (userId, companyId, leaveData) => {
  const { leaveType, startDate, endDate, reason, attachments } = leaveData;
  
  // Validate dates
  if (new Date(startDate) > new Date(endDate)) {
    throw new Error(ERROR_MESSAGES.INVALID_DATE_RANGE);
  }
  
  // Calculate days
  const days = calculateLeaveDays(startDate, endDate);
  
  if (days === 0) {
    throw new Error('Leave must be at least 1 working day');
  }
  
  // Check for overlapping leaves
  const overlapping = await hasOverlappingLeave(userId, startDate, endDate);
  if (overlapping) {
    throw new Error(ERROR_MESSAGES.OVERLAPPING_LEAVE);
  }
  
  // Check balance
  const hasBalance = await checkLeaveBalance(userId, leaveType, days);
  if (!hasBalance) {
    throw new Error(ERROR_MESSAGES.INSUFFICIENT_BALANCE);
  }
  
  // Create leave request
  const leave = await Leave.create({
    user: userId,
    company: companyId,
    leaveType,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    days,
    reason,
    attachments: attachments || [],
    status: LEAVE_STATUS.PENDING
  });
  
  return leave;
};

/**
 * Approve leave request
 */
const approveLeave = async (leaveId, reviewerId, reviewNote) => {
  const leave = await Leave.findById(leaveId).populate('user');
  
  if (!leave) {
    throw new Error('Leave request not found');
  }
  
  if (leave.status !== LEAVE_STATUS.PENDING) {
    throw new Error(ERROR_MESSAGES.INVALID_STATUS_TRANSITION);
  }
  
  // Deduct leave balance
  await deductLeaveBalance(leave.user._id, leave.leaveType, leave.days);
  
  // Update leave record
  leave.status = LEAVE_STATUS.APPROVED;
  leave.reviewedBy = reviewerId;
  leave.reviewedAt = new Date();
  leave.reviewNote = reviewNote;
  leave.balanceDeducted = leave.days;
  
  await leave.save();
  
  // Update user status if leave starts today or in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const leaveStart = new Date(leave.startDate);
  leaveStart.setHours(0, 0, 0, 0);
  
  if (leaveStart <= today) {
    await User.findByIdAndUpdate(leave.user._id, {
      status: 'on-leave'
    });
  }
  
  return leave;
};

/**
 * Reject leave request
 */
const rejectLeave = async (leaveId, reviewerId, reviewNote) => {
  const leave = await Leave.findById(leaveId);
  
  if (!leave) {
    throw new Error('Leave request not found');
  }
  
  if (leave.status !== LEAVE_STATUS.PENDING) {
    throw new Error(ERROR_MESSAGES.INVALID_STATUS_TRANSITION);
  }
  
  // Update leave record
  leave.status = LEAVE_STATUS.REJECTED;
  leave.reviewedBy = reviewerId;
  leave.reviewedAt = new Date();
  leave.reviewNote = reviewNote;
  
  await leave.save();
  return leave;
};

/**
 * Cancel leave request
 */
const cancelLeave = async (leaveId, userId, userRole) => {
  const leave = await Leave.findById(leaveId);
  
  if (!leave) {
    throw new Error('Leave request not found');
  }
  
  // Only the requester or HR/Admin can cancel
  if (leave.user.toString() !== userId.toString() && 
      userRole !== ROLES.HR && 
      userRole !== ROLES.ADMIN) {
    throw new Error(ERROR_MESSAGES.FORBIDDEN);
  }
  
  // Can only cancel pending or approved leaves
  if (leave.status === LEAVE_STATUS.REJECTED || leave.status === LEAVE_STATUS.CANCELLED) {
    throw new Error('Cannot cancel this leave request');
  }
  
  // If leave was approved, restore balance
  if (leave.status === LEAVE_STATUS.APPROVED && leave.balanceDeducted > 0) {
    await restoreLeaveBalance(leave.user, leave.leaveType, leave.balanceDeducted);
    leave.balanceRestored = true;
  }
  
  leave.status = LEAVE_STATUS.CANCELLED;
  await leave.save();
  
  // Update user status back to active if currently on leave
  await User.findByIdAndUpdate(leave.user, {
    status: 'active'
  });
  
  return leave;
};

/**
 * Get leave requests with filters
 */
const getLeaveRequests = async (companyId, filters = {}) => {
  const query = {};
  
  // Company filter (optional)
  if (companyId) {
    query.company = companyId;
  }
  
  // User filter
  if (filters.userId) {
    query.user = filters.userId;
  }
  
  // Status filter
  if (filters.status) {
    query.status = filters.status;
  }
  
  // Leave type filter
  if (filters.leaveType) {
    query.leaveType = filters.leaveType;
  }
  
  // Date range filter
  if (filters.startDate && filters.endDate) {
    query.startDate = { $gte: new Date(filters.startDate) };
    query.endDate = { $lte: new Date(filters.endDate) };
  }
  
  const leaves = await Leave.find(query)
    .sort({ createdAt: -1 })
    .populate('user', 'name employeeId department position email')
    .populate('reviewedBy', 'name employeeId');
  
  return leaves;
};

/**
 * Get leave balance for user
 */
const getLeaveBalance = async (userId) => {
  const user = await User.findById(userId).select('leaveBalance');
  
  if (!user) {
    throw new Error('User not found');
  }
  
  return user.leaveBalance;
};

/**
 * Get leave statistics for user
 */
const getLeaveStatistics = async (userId, year) => {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  
  const leaves = await Leave.find({
    user: userId,
    startDate: { $gte: startDate },
    endDate: { $lte: endDate }
  });
  
  const stats = {
    total: leaves.length,
    pending: leaves.filter(l => l.status === LEAVE_STATUS.PENDING).length,
    approved: leaves.filter(l => l.status === LEAVE_STATUS.APPROVED).length,
    rejected: leaves.filter(l => l.status === LEAVE_STATUS.REJECTED).length,
    cancelled: leaves.filter(l => l.status === LEAVE_STATUS.CANCELLED).length,
    daysTaken: leaves
      .filter(l => l.status === LEAVE_STATUS.APPROVED)
      .reduce((sum, l) => sum + l.days, 0),
    byType: {}
  };
  
  // Calculate days by type
  Object.values(LEAVE_TYPES).forEach(type => {
    stats.byType[type] = leaves
      .filter(l => l.leaveType === type && l.status === LEAVE_STATUS.APPROVED)
      .reduce((sum, l) => sum + l.days, 0);
  });
  
  return stats;
};

module.exports = {
  createLeaveRequest,
  approveLeave,
  rejectLeave,
  cancelLeave,
  getLeaveRequests,
  getLeaveBalance,
  getLeaveStatistics,
  calculateLeaveDays,
  hasOverlappingLeave
};

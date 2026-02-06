/**
 * LEAVE CONTROLLER - Request handlers for leave management
 * 
 * WHY: Handles leave requests, approvals, rejections with balance management.
 * Delegates business logic to service layer.
 */

const leaveService = require('../services/leave.service');
const { HTTP_STATUS, SUCCESS_MESSAGES, ROLES } = require('../constants');

/**
 * @desc    Create leave request
 * @route   POST /api/leave
 * @access  Private (Employee)
 */
exports.createLeaveRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const companyId = req.user.company || null; // Make company optional
    
    const leave = await leaveService.createLeaveRequest(userId, companyId, req.body);
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: SUCCESS_MESSAGES.LEAVE_REQUESTED,
      data: leave
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get leave requests
 * @route   GET /api/leave
 * @access  Private
 */
exports.getLeaveRequests = async (req, res) => {
  try {
    const companyId = req.user.company;
    const filters = { ...req.query };
    
    // If employee, only show their leaves
    if (req.user.role === ROLES.EMPLOYEE) {
      filters.userId = req.user._id;
    }
    
    const leaves = await leaveService.getLeaveRequests(companyId, filters);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      count: leaves.length,
      data: leaves
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get single leave request
 * @route   GET /api/leave/:id
 * @access  Private
 */
exports.getLeaveById = async (req, res) => {
  try {
    const Leave = require('../models/Leave.model');
    const leave = await Leave.findById(req.params.id)
      .populate('user', 'name employeeId department position')
      .populate('reviewedBy', 'name employeeId');
    
    if (!leave) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Leave request not found'
      });
    }
    
    // Check company access
    if (leave.company.toString() !== req.user.company.toString()) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Employees can only view their own leaves
    if (req.user.role === ROLES.EMPLOYEE && 
        leave.user._id.toString() !== req.user._id.toString()) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: leave
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Approve leave request
 * @route   PUT /api/leave/:id/approve
 * @access  Private (HR, Admin)
 */
exports.approveLeave = async (req, res) => {
  try {
    const { reviewNote } = req.body;
    const reviewerId = req.user._id;
    
    const leave = await leaveService.approveLeave(
      req.params.id, 
      reviewerId, 
      reviewNote
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.LEAVE_APPROVED,
      data: leave
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Reject leave request
 * @route   PUT /api/leave/:id/reject
 * @access  Private (HR, Admin)
 */
exports.rejectLeave = async (req, res) => {
  try {
    const { reviewNote } = req.body;
    const reviewerId = req.user._id;
    
    if (!reviewNote) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Review note is required when rejecting leave'
      });
    }
    
    const leave = await leaveService.rejectLeave(
      req.params.id, 
      reviewerId, 
      reviewNote
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.LEAVE_REJECTED,
      data: leave
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Cancel leave request
 * @route   PUT /api/leave/:id/cancel
 * @access  Private
 */
exports.cancelLeave = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    
    const leave = await leaveService.cancelLeave(
      req.params.id, 
      userId, 
      userRole
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.LEAVE_CANCELLED,
      data: leave
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get leave balance
 * @route   GET /api/leave/balance
 * @access  Private
 */
exports.getLeaveBalance = async (req, res) => {
  try {
    const userId = req.query.userId || req.user._id;
    
    // Employees can only view their own balance
    if (req.user.role === ROLES.EMPLOYEE && userId !== req.user._id.toString()) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const balance = await leaveService.getLeaveBalance(userId);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: balance
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get leave statistics
 * @route   GET /api/leave/statistics
 * @access  Private
 */
exports.getLeaveStatistics = async (req, res) => {
  try {
    const userId = req.query.userId || req.user._id;
    const year = req.query.year || new Date().getFullYear();
    
    // Employees can only view their own statistics
    if (req.user.role === ROLES.EMPLOYEE && userId !== req.user._id.toString()) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const stats = await leaveService.getLeaveStatistics(userId, parseInt(year));
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

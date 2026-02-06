/**
 * LEAVE ROUTES - Endpoints for leave management
 * 
 * WHY: Defines all leave-related routes with proper validation,
 * authorization, and company isolation.
 */

const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middleware/auth.middleware');
const { validateLeaveRequest, validateObjectId, validateDateRange } = require('../middleware/validator');
const { enforceCompanyAccess } = require('../middleware/companyIsolation.middleware');
const leaveController = require('../controllers/leaveController');
const Leave = require('../models/Leave.model');

// All routes require authentication
router.use(protect);

/**
 * @route   GET /api/leave/balance
 * @desc    Get leave balance
 * @access  Private (All authenticated users)
 */
router.get('/balance', leaveController.getLeaveBalance);

/**
 * @route   GET /api/leave/statistics
 * @desc    Get leave statistics
 * @access  Private (All authenticated users)
 */
router.get('/statistics', leaveController.getLeaveStatistics);

/**
 * @route   POST /api/leave
 * @desc    Create leave request
 * @access  Private (All authenticated users)
 */
router.post('/', validateLeaveRequest, leaveController.createLeaveRequest);

/**
 * @route   GET /api/leave
 * @desc    Get leave requests (filtered by role)
 * @access  Private (All authenticated users)
 */
router.get('/', validateDateRange, leaveController.getLeaveRequests);

/**
 * @route   GET /api/leave/:id
 * @desc    Get single leave request
 * @access  Private (All authenticated users)
 */
router.get(
  '/:id',
  validateObjectId('id'),
  enforceCompanyAccess(Leave),
  leaveController.getLeaveById
);

/**
 * @route   PUT /api/leave/:id/approve
 * @desc    Approve leave request
 * @access  Private (HR, Admin)
 */
router.put(
  '/:id/approve',
  authorize('admin', 'hr'),
  validateObjectId('id'),
  enforceCompanyAccess(Leave),
  leaveController.approveLeave
);

/**
 * @route   PUT /api/leave/:id/reject
 * @desc    Reject leave request
 * @access  Private (HR, Admin)
 */
router.put(
  '/:id/reject',
  authorize('admin', 'hr'),
  validateObjectId('id'),
  enforceCompanyAccess(Leave),
  leaveController.rejectLeave
);

/**
 * @route   PUT /api/leave/:id/cancel
 * @desc    Cancel leave request
 * @access  Private (All authenticated users - with permission check in controller)
 */
router.put(
  '/:id/cancel',
  validateObjectId('id'),
  enforceCompanyAccess(Leave),
  leaveController.cancelLeave
);

module.exports = router;


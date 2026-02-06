/**
 * ATTENDANCE ROUTES - Endpoints for attendance management
 * 
 * WHY: Defines all attendance-related routes with proper authentication,
 * authorization, validation, and company isolation middleware.
 */

const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middleware/auth.middleware');
const { validateAttendance, validateObjectId, validateDateRange } = require('../middleware/validator');
const { enforceCompanyAccess } = require('../middleware/companyIsolation.middleware');
const attendanceController = require('../controllers/attendanceController');
const upload = require('../middleware/uploadMiddleware');

// All routes require authentication
router.use(protect);

/**
 * @route   POST /api/attendance/check-in
 * @desc    Check in for the day (with optional photo upload)
 * @access  Private (All authenticated users)
 */
router.post('/check-in', upload.single('photo'), attendanceController.checkIn);

/**
 * @route   POST /api/attendance/check-out
 * @desc    Check out for the day
 * @access  Private (All authenticated users)
 */
router.post('/check-out', validateAttendance, attendanceController.checkOut);

/**
 * @route   GET /api/attendance/today
 * @desc    Get today's attendance status
 * @access  Private (All authenticated users)
 */
router.get('/today', attendanceController.getTodayAttendance);

/**
 * @route   GET /api/attendance/my-attendance
 * @desc    Get my attendance records
 * @access  Private (All authenticated users)
 */
router.get('/my-attendance', validateDateRange, attendanceController.getMyAttendance);

/**
 * @route   GET /api/attendance/summary
 * @desc    Get attendance summary for a month
 * @access  Private (All authenticated users)
 */
router.get('/summary', attendanceController.getAttendanceSummary);

/**
 * @route   POST /api/attendance/edit-request
 * @desc    Submit attendance edit request (Employee)
 * @access  Private (All authenticated users)
 */
router.post('/edit-request', attendanceController.createEditRequest);

/**
 * @route   GET /api/attendance/edit-requests
 * @desc    Get my edit requests (Employee)
 * @access  Private (All authenticated users)
 */
router.get('/edit-requests', attendanceController.getMyEditRequests);

/**
 * @route   GET /api/attendance/edit-requests/pending
 * @desc    Get pending edit requests (HR/Admin)
 * @access  Private (HR, Admin)
 */
router.get(
  '/edit-requests/pending',
  authorize('admin', 'hr'),
  attendanceController.getPendingEditRequests
);

/**
 * @route   PUT /api/attendance/edit-requests/:requestId
 * @desc    Approve or reject edit request (HR/Admin)
 * @access  Private (HR, Admin)
 */
router.put(
  '/edit-requests/:requestId',
  authorize('admin', 'hr'),
  attendanceController.reviewEditRequest
);

/**
 * @route   GET /api/attendance
 * @desc    Get all company attendance records
 * @access  Private (HR, Admin)
 */
router.get(
  '/',
  authorize('admin', 'hr'),
  validateDateRange,
  attendanceController.getAllAttendance
);

/**
 * @route   POST /api/attendance/mark
 * @desc    Manually mark attendance (HR/Admin only)
 * @access  Private (HR, Admin)
 */
router.post(
  '/mark',
  authorize('admin', 'hr'),
  attendanceController.markAttendance
);

module.exports = router;


/**
 * ATTENDANCE CONTROLLER - Request handlers for attendance endpoints
 * 
 * WHY: Thin controller layer that delegates to service layer.
 * Handles HTTP-specific concerns (request/response) while business logic stays in services.
 */

const attendanceService = require('../services/attendance.service');
const { uploadToCloudinary } = require('../utils/uploadToCloudinary');
const { HTTP_STATUS, SUCCESS_MESSAGES, ERROR_MESSAGES } = require('../constants');

/**
 * @desc    Check in employee with optional photo
 * @route   POST /api/attendance/check-in
 * @access  Private (Employee)
 */
exports.checkIn = async (req, res) => {
  try {
    let { location } = req.body;
    const userId = req.user._id;
    const companyId = req.user.company || null;
    
    // Parse location if it's a JSON string (from FormData)
    if (typeof location === 'string') {
      try {
        location = JSON.parse(location);
      } catch (parseError) {
        console.error('Failed to parse location:', parseError);
        location = null;
      }
    }
    
    // Handle photo upload if provided
    let photo = null;
    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, {
          folder: `attendance/${companyId || 'general'}/checkin-photos`,
          resource_type: 'image'
        });
        photo = {
          url: result.secure_url,
          publicId: result.public_id
        };
        console.log('✅ Check-in photo uploaded:', result.public_id);
      } catch (uploadError) {
        console.error('❌ Photo upload failed:', uploadError);
        // Continue without photo - don't block check-in
      }
    }
    
    const attendance = await attendanceService.checkIn(userId, companyId, location, photo);
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: SUCCESS_MESSAGES.CHECKED_IN,
      data: attendance
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Check out employee
 * @route   POST /api/attendance/check-out
 * @access  Private (Employee)
 */
exports.checkOut = async (req, res) => {
  try {
    const { location } = req.body;
    const userId = req.user._id;
    const companyId = req.user.company || null;
    
    const attendance = await attendanceService.checkOut(userId, companyId, location);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.CHECKED_OUT,
      data: attendance
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get my attendance records
 * @route   GET /api/attendance/my-attendance
 * @access  Private (Employee)
 */
exports.getMyAttendance = async (req, res) => {
  try {
    const userId = req.user._id;
    const companyId = req.user.company;
    const filters = req.query;
    
    const attendance = await attendanceService.getAttendanceRecords(
      userId, 
      companyId, 
      filters
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      count: attendance.length,
      data: attendance
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get all company attendance (HR/Admin)
 * @route   GET /api/attendance
 * @access  Private (HR, Admin)
 */
exports.getAllAttendance = async (req, res) => {
  try {
    const companyId = req.user.company || req.query.companyId;
    const filters = req.query;
    
    if (!companyId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Company ID is required'
      });
    }
    
    const attendance = await attendanceService.getAllCompanyAttendance(
      companyId, 
      filters
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      count: attendance.length,
      data: attendance
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Mark attendance manually (HR/Admin)
 * @route   POST /api/attendance/mark
 * @access  Private (HR, Admin)
 */
exports.markAttendance = async (req, res) => {
  try {
    const { userId, ...attendanceData } = req.body;
    const companyId = req.user.company;
    const markedById = req.user._id;
    
    if (!userId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    const attendance = await attendanceService.markAttendanceManually(
      userId,
      companyId,
      attendanceData,
      markedById
    );
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Attendance marked successfully',
      data: attendance
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get attendance summary
 * @route   GET /api/attendance/summary
 * @access  Private
 */
exports.getAttendanceSummary = async (req, res) => {
  try {
    const userId = req.query.userId || req.user._id;
    const companyId = req.user.company;
    const { month, year } = req.query;
    
    if (!month || !year) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Month and year are required'
      });
    }
    
    const summary = await attendanceService.getAttendanceSummary(
      userId,
      companyId,
      parseInt(month),
      parseInt(year)
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get today's attendance status
 * @route   GET /api/attendance/today
 * @access  Private
 */
exports.getTodayAttendance = async (req, res) => {
  try {
    const userId = req.user._id;
    const today = new Date();
    
    const attendance = await attendanceService.hasAttendanceForDate(userId, today);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: attendance || null,
      hasCheckedIn: attendance?.checkIn?.time ? true : false,
      hasCheckedOut: attendance?.checkOut?.time ? true : false
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Create attendance edit request (Employee)
 * @route   POST /api/attendance/edit-request
 * @access  Private (Employee)
 */
exports.createEditRequest = async (req, res) => {
  try {
    const { attendanceId, requestedCheckIn, requestedCheckOut, reason } = req.body;
    const userId = req.user._id;
    const companyId = req.user.company;
    
    if (!attendanceId || !requestedCheckIn || !requestedCheckOut || !reason) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'All fields are required: attendanceId, requestedCheckIn, requestedCheckOut, reason'
      });
    }
    
    if (reason.length < 10) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Reason must be at least 10 characters'
      });
    }
    
    const editRequest = await attendanceService.createEditRequest(
      userId,
      companyId,
      attendanceId,
      { requestedCheckIn, requestedCheckOut, reason }
    );
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Edit request submitted successfully',
      data: editRequest
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get my edit requests (Employee)
 * @route   GET /api/attendance/edit-requests
 * @access  Private (Employee)
 */
exports.getMyEditRequests = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const requests = await attendanceService.getMyEditRequests(userId);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get pending edit requests (HR/Admin)
 * @route   GET /api/attendance/edit-requests/pending
 * @access  Private (HR, Admin)
 */
exports.getPendingEditRequests = async (req, res) => {
  try {
    const companyId = req.user.company;
    const userRole = req.user.role;
    
    const requests = await attendanceService.getPendingEditRequests(companyId, userRole);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Review edit request (HR/Admin)
 * @route   PUT /api/attendance/edit-requests/:requestId
 * @access  Private (HR, Admin)
 */
exports.reviewEditRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action, reviewNote } = req.body;
    const reviewerId = req.user._id;
    
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Action must be "approved" or "rejected"'
      });
    }
    
    const request = await attendanceService.reviewEditRequest(
      requestId,
      reviewerId,
      action,
      reviewNote
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Edit request ${action} successfully`,
      data: request
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * ATTENDANCE SERVICE - Business logic for attendance management
 * 
 * WHY: Separates business logic from controllers for better testability
 * and maintainability. Handles complex attendance rules and validations.
 */

const { Attendance, AttendanceEditRequest } = require('../models/Attendance.model');
const User = require('../models/User.model');
const { 
  ATTENDANCE_STATUS, 
  BUSINESS_RULES, 
  ERROR_MESSAGES 
} = require('../constants');

/**
 * Check if user already has attendance for a specific date
 */
const hasAttendanceForDate = async (userId, date) => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const existing = await Attendance.findOne({
    user: userId,
    date: { $gte: startOfDay, $lte: endOfDay }
  });
  
  return existing;
};

/**
 * Calculate attendance status based on check-in time
 */
const calculateAttendanceStatus = (checkInTime, standardStartTime = '09:00') => {
  const checkIn = new Date(checkInTime);
  const [hours, minutes] = standardStartTime.split(':');
  
  const standardTime = new Date(checkIn);
  standardTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  
  const diffMinutes = (checkIn - standardTime) / (1000 * 60);
  
  if (diffMinutes <= BUSINESS_RULES.GRACE_PERIOD_MINUTES) {
    return ATTENDANCE_STATUS.PRESENT;
  } else if (diffMinutes <= BUSINESS_RULES.LATE_THRESHOLD_MINUTES) {
    return ATTENDANCE_STATUS.LATE;
  } else {
    return ATTENDANCE_STATUS.LATE;
  }
};

/**
 * Check in employee with optional photo
 */
const checkIn = async (userId, companyId, location, photo = null) => {
  // Check if already checked in today
  const today = new Date();
  const existingAttendance = await hasAttendanceForDate(userId, today);
  
  if (existingAttendance) {
    if (existingAttendance.checkIn?.time) {
      throw new Error(ERROR_MESSAGES.ALREADY_CHECKED_IN);
    }
  }
  
  const checkInTime = new Date();
  const status = calculateAttendanceStatus(checkInTime);
  
  // Build checkIn object with optional photo
  const checkInData = {
    time: checkInTime,
    location: location
  };
  
  // Add photo if provided (Cloudinary URL)
  if (photo && photo.url) {
    checkInData.photo = {
      url: photo.url,
      publicId: photo.publicId,
      capturedAt: checkInTime
    };
  }
  
  // Create or update attendance
  let attendance;
  if (existingAttendance) {
    existingAttendance.checkIn = checkInData;
    existingAttendance.status = status;
    attendance = await existingAttendance.save();
  } else {
    attendance = await Attendance.create({
      user: userId,
      company: companyId,
      date: today,
      checkIn: checkInData,
      status: status
    });
  }
  
  return attendance;
};

/**
 * Check out employee
 */
const checkOut = async (userId, companyId, location) => {
  const today = new Date();
  const attendance = await hasAttendanceForDate(userId, today);
  
  if (!attendance) {
    throw new Error(ERROR_MESSAGES.NOT_CHECKED_IN);
  }
  
  if (!attendance.checkIn?.time) {
    throw new Error(ERROR_MESSAGES.NOT_CHECKED_IN);
  }
  
  if (attendance.checkOut?.time) {
    throw new Error('Already checked out for today');
  }
  
  const checkOutTime = new Date();
  
  // Validate checkout time is after check-in
  if (checkOutTime <= attendance.checkIn.time) {
    throw new Error(ERROR_MESSAGES.INVALID_CHECKOUT);
  }
  
  attendance.checkOut = {
    time: checkOutTime,
    location: location
  };
  
  // Work hours will be auto-calculated by model pre-save hook
  // But we can also determine if it's half-day
  const hoursWorked = (checkOutTime - attendance.checkIn.time) / (1000 * 60 * 60);
  
  if (hoursWorked < BUSINESS_RULES.MIN_CHECKOUT_HOURS) {
    attendance.status = ATTENDANCE_STATUS.HALF_DAY;
  }
  
  await attendance.save();
  return attendance;
};

/**
 * Get attendance records for a user with filters
 */
const getAttendanceRecords = async (userId, companyId, filters = {}) => {
  const query = { user: userId, company: companyId };
  
  // Date range filter
  if (filters.startDate && filters.endDate) {
    query.date = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate)
    };
  } else if (filters.month && filters.year) {
    const startDate = new Date(filters.year, filters.month - 1, 1);
    const endDate = new Date(filters.year, filters.month, 0);
    query.date = { $gte: startDate, $lte: endDate };
  }
  
  // Status filter
  if (filters.status) {
    query.status = filters.status;
  }
  
  const attendance = await Attendance.find(query)
    .sort({ date: -1 })
    .populate('user', 'name employeeId department')
    .populate('markedBy', 'name employeeId');
  
  return attendance;
};

/**
 * Get all attendance for company (HR/Admin view)
 */
const getAllCompanyAttendance = async (companyId, filters = {}) => {
  const query = { company: companyId };
  
  // Date range filter
  if (filters.startDate && filters.endDate) {
    query.date = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate)
    };
  }
  
  // Status filter
  if (filters.status) {
    query.status = filters.status;
  }
  
  // Department filter
  if (filters.department) {
    const users = await User.find({ 
      company: companyId, 
      department: filters.department 
    }).select('_id');
    query.user = { $in: users.map(u => u._id) };
  }
  
  const attendance = await Attendance.find(query)
    .sort({ date: -1 })
    .populate('user', 'name employeeId department position role')
    .populate('markedBy', 'name employeeId');
  
  return attendance;
};

/**
 * Mark attendance manually (HR/Admin only)
 */
const markAttendanceManually = async (userId, companyId, data, markedById) => {
  const { date, status, checkIn, checkOut, notes } = data;
  
  // Check if attendance already exists
  const existing = await hasAttendanceForDate(userId, date);
  
  if (existing && !data.overwrite) {
    throw new Error(ERROR_MESSAGES.DUPLICATE_ATTENDANCE);
  }
  
  let attendance;
  if (existing && data.overwrite) {
    // Update existing
    existing.status = status;
    existing.checkIn = checkIn;
    existing.checkOut = checkOut;
    existing.notes = notes;
    existing.isManualEntry = true;
    existing.markedBy = markedById;
    attendance = await existing.save();
  } else {
    // Create new
    attendance = await Attendance.create({
      user: userId,
      company: companyId,
      date: new Date(date),
      status: status,
      checkIn: checkIn,
      checkOut: checkOut,
      notes: notes,
      isManualEntry: true,
      markedBy: markedById
    });
  }
  
  return attendance;
};

/**
 * Get attendance summary/statistics
 */
const getAttendanceSummary = async (userId, companyId, month, year) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  const attendance = await Attendance.find({
    user: userId,
    company: companyId,
    date: { $gte: startDate, $lte: endDate }
  });
  
  const summary = {
    totalDays: attendance.length,
    present: attendance.filter(a => a.status === ATTENDANCE_STATUS.PRESENT).length,
    late: attendance.filter(a => a.status === ATTENDANCE_STATUS.LATE).length,
    halfDay: attendance.filter(a => a.status === ATTENDANCE_STATUS.HALF_DAY).length,
    absent: attendance.filter(a => a.status === ATTENDANCE_STATUS.ABSENT).length,
    wfh: attendance.filter(a => a.status === ATTENDANCE_STATUS.WORK_FROM_HOME).length,
    totalWorkHours: attendance.reduce((sum, a) => sum + (a.workHours || 0), 0),
    averageWorkHours: 0
  };
  
  summary.averageWorkHours = summary.totalDays > 0 
    ? (summary.totalWorkHours / summary.totalDays).toFixed(2) 
    : 0;
  
  return summary;
};

/**
 * Create attendance edit request (Employee)
 */
const createEditRequest = async (userId, companyId, attendanceId, requestData) => {
  const { requestedCheckIn, requestedCheckOut, reason } = requestData;
  
  // Find the attendance record
  const attendance = await Attendance.findOne({
    _id: attendanceId,
    user: userId
  });
  
  if (!attendance) {
    throw new Error('Attendance record not found');
  }
  
  // Check if there's already a pending request for this attendance
  const existingRequest = await AttendanceEditRequest.findOne({
    attendance: attendanceId,
    status: 'pending'
  });
  
  if (existingRequest) {
    throw new Error('You already have a pending edit request for this date');
  }
  
  // Create the edit request
  const editRequest = await AttendanceEditRequest.create({
    attendance: attendanceId,
    user: userId,
    company: companyId,
    date: attendance.date,
    originalCheckIn: attendance.checkIn?.time,
    originalCheckOut: attendance.checkOut?.time,
    requestedCheckIn: new Date(requestedCheckIn),
    requestedCheckOut: new Date(requestedCheckOut),
    reason: reason,
    status: 'pending'
  });
  
  return editRequest;
};

/**
 * Get edit requests for a user
 */
const getMyEditRequests = async (userId) => {
  const requests = await AttendanceEditRequest.find({ user: userId })
    .sort({ createdAt: -1 })
    .populate('reviewedBy', 'name');
  
  return requests;
};

/**
 * Get pending edit requests for company (HR/Admin)
 * HR sees only employee requests, Admin sees all (employee + HR)
 */
const getPendingEditRequests = async (companyId, userRole) => {
  const requests = await AttendanceEditRequest.find({
    company: companyId,
    status: 'pending'
  })
    .sort({ createdAt: -1 })
    .populate('user', 'name employeeId department position email profilePhoto role')
    .populate('attendance');
  
  // Transform 'user' field to 'employee' for frontend consistency
  let filteredRequests = requests.map(req => {
    const obj = req.toObject();
    obj.employee = obj.user;
    return obj;
  });
  
  // If requester is HR, filter out HR attendance edit requests (they only see employee requests)
  // If requester is Admin, show all requests (employee + HR)
  if (userRole === 'hr') {
    filteredRequests = filteredRequests.filter(req => req.employee.role === 'employee');
  }
  
  return filteredRequests;
};

/**
 * Approve or reject edit request (HR/Admin)
 */
const reviewEditRequest = async (requestId, reviewerId, action, reviewNote = '') => {
  const request = await AttendanceEditRequest.findById(requestId);
  
  if (!request) {
    throw new Error('Edit request not found');
  }
  
  if (request.status !== 'pending') {
    throw new Error('This request has already been processed');
  }
  
  request.status = action; // 'approved' or 'rejected'
  request.reviewedBy = reviewerId;
  request.reviewedAt = new Date();
  request.reviewNote = reviewNote;
  
  await request.save();
  
  // If approved, update the actual attendance record
  if (action === 'approved') {
    const attendance = await Attendance.findById(request.attendance);
    
    if (attendance) {
      // Only update the time fields, preserve location and photo
      if (attendance.checkIn) {
        attendance.checkIn.time = request.requestedCheckIn;
      } else {
        attendance.checkIn = { time: request.requestedCheckIn };
      }
      
      if (attendance.checkOut) {
        attendance.checkOut.time = request.requestedCheckOut;
      } else {
        attendance.checkOut = { time: request.requestedCheckOut };
      }
      
      attendance.notes = `Edited by HR/Admin on ${new Date().toLocaleString()}. Reason: ${request.reason}`;
      attendance.approvedBy = reviewerId;
      await attendance.save();
    }
  }
  
  return request;
};

module.exports = {
  checkIn,
  checkOut,
  getAttendanceRecords,
  getAllCompanyAttendance,
  markAttendanceManually,
  getAttendanceSummary,
  hasAttendanceForDate,
  createEditRequest,
  getMyEditRequests,
  getPendingEditRequests,
  reviewEditRequest
};

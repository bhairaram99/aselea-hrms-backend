/**
 * EMPLOYEE CONTROLLER - Handles employee-specific operations
 * 
 * Provides employee dashboard, profile management, and self-service features
 */

const User = require('../models/User.model');
const Leave = require('../models/Leave.model');
const Task = require('../models/Task.model');
const Expense = require('../models/Expense.model');
const { Attendance } = require('../models/Attendance.model');

/**
 * @desc    Get employee dashboard statistics
 * @route   GET /api/employee/dashboard
 * @access  Private (Employee only)
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const userName = req.user.name;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Get today's attendance
    const todayAttendance = await Attendance.findOne({ 
      user: userId,
      date: { $gte: today, $lt: tomorrow }
    });

    // Get counts and data in parallel
    const [
      activeTasks,
      pendingExpensesData,
      currentMonthAttendance,
      totalWorkingDaysInMonth,
      recentTasks,
      recentAnnouncements,
      userProfile
    ] = await Promise.all([
      Task.countDocuments({ 
        assignedTo: userId,
        status: { $in: ['todo', 'in-progress'] }
      }),
      // Get sum of pending expenses
      Expense.aggregate([
        { $match: { user: userId, status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Attendance.countDocuments({
        user: userId,
        date: { $gte: currentMonth },
        'checkIn.time': { $exists: true }
      }),
      // Total working days this month (days that have passed)
      Promise.resolve(new Date().getDate()),
      // Get recent tasks
      Task.find({ assignedTo: userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title status priority deadline'),
      // Get recent announcements
      require('../models/Announcement.model').find()
        .sort({ createdAt: -1 })
        .limit(3)
        .select('title message createdAt'),
      // Get user profile for leave balance
      User.findById(userId).select('leaveBalance')
    ]);

    // Calculate pending expenses total
    const pendingExpensesTotal = pendingExpensesData.length > 0 ? pendingExpensesData[0].total : 0;

    // Calculate attendance percentage for current month
    const daysInMonth = totalWorkingDaysInMonth;
    const attendancePercentage = daysInMonth > 0 
      ? Math.round((currentMonthAttendance / daysInMonth) * 100) 
      : 0;

    // Calculate working hours for today
    let workingHours = 0;
    let workingMinutes = 0;
    if (todayAttendance?.checkIn?.time) {
      const checkInTime = new Date(todayAttendance.checkIn.time);
      const currentTime = todayAttendance.checkOut?.time 
        ? new Date(todayAttendance.checkOut.time) 
        : new Date();
      const diffMs = currentTime - checkInTime;
      const totalMinutes = Math.floor(diffMs / (1000 * 60));
      workingHours = Math.floor(totalMinutes / 60);
      workingMinutes = totalMinutes % 60;
    }

    const workTarget = 8; // 8 hours target
    const workProgress = workingHours > 0 
      ? Math.round((workingHours / workTarget) * 100) 
      : 0;

    res.status(200).json({
      success: true,
      data: {
        user: {
          name: userName
        },
        stats: {
          leaveBalance: userProfile?.leaveBalance || 0,
          activeTasks,
          pendingExpenses: pendingExpensesTotal,
          attendancePercentage
        },
        attendance: {
          isPunchedIn: !!(todayAttendance?.checkIn?.time && !todayAttendance?.checkOut?.time),
          punchTime: todayAttendance?.checkIn?.time 
            ? new Date(todayAttendance.checkIn.time).toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })
            : null,
          workingHours: `${workingHours}h ${workingMinutes}m`,
          workProgress,
          workTarget
        },
        tasks: recentTasks,
        announcements: recentAnnouncements
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee dashboard stats',
      error: error.message
    });
  }
};

/**
 * @desc    Get employee profile
 * @route   GET /api/employee/profile
 * @access  Private (Employee only)
 */
exports.getProfile = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id)
      .select('-password')
      .populate('company', 'name email phone address logo')
      .populate('reportingTo', 'name email position phone')
      .lean();

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.status(200).json({
      success: true,
      data: employee
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
};

/**
 * @desc    Update employee profile
 * @route   PUT /api/employee/profile
 * @access  Private (Employee only)
 */
exports.updateProfile = async (req, res) => {
  try {
    const { uploadToCloudinary } = require('../utils/uploadToCloudinary');
    
    // Fields that employees can update themselves
    const allowedFields = {
      phone: req.body.phone,
      address: req.body.address,
      dateOfBirth: req.body.dateOfBirth,
    };

    // Handle profile photo upload
    if (req.file) {
      try {
        const result = await uploadToCloudinary(req.file.buffer, { 
          folder: 'profile-photos',
          resource_type: 'image'
        });
        allowedFields.profilePhoto = result.secure_url;
      } catch (uploadError) {
        console.error('Photo upload error:', uploadError);
        return res.status(400).json({
          success: false,
          message: 'Failed to upload profile photo',
          error: uploadError.message
        });
      }
    }

    // Remove undefined fields
    Object.keys(allowedFields).forEach(
      key => allowedFields[key] === undefined && delete allowedFields[key]
    );

    const employee = await User.findByIdAndUpdate(
      req.user._id,
      allowedFields,
      { new: true, runValidators: true }
    ).select('-password');

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: employee
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

/**
 * @desc    Change password
 * @route   PUT /api/employee/change-password
 * @access  Private (Employee only)
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }

    // Get user with password
    const user = await User.findById(req.user._id).select('+password');

    // Check current password
    const isMatch = await user.matchPassword(currentPassword);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
};

/**
 * @desc    Get my tasks
 * @route   GET /api/employee/tasks
 * @access  Private (Employee only)
 */
exports.getMyTasks = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { assignedTo: req.user._id };

    if (status) {
      filter.status = status;
    }

    const tasks = await Task.find(filter)
      .populate('assignedBy', 'name email position')
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tasks',
      error: error.message
    });
  }
};

/**
 * @desc    Get my leaves
 * @route   GET /api/employee/leaves
 * @access  Private (Employee only)
 */
exports.getMyLeaves = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { user: req.user._id };

    if (status) {
      filter.status = status;
    }

    const leaves = await Leave.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: leaves.length,
      data: leaves
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leaves',
      error: error.message
    });
  }
};

/**
 * @desc    Get my expenses
 * @route   GET /api/employee/expenses
 * @access  Private (Employee only)
 */
exports.getMyExpenses = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { employee: req.user._id };

    if (status) {
      filter.status = status;
    }

    const expenses = await Expense.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: expenses.length,
      data: expenses
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses',
      error: error.message
    });
  }
};

/**
 * @desc    Get my attendance history
 * @route   GET /api/employee/attendance
 * @access  Private (Employee only)
 */
exports.getMyAttendance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = { user: req.user._id };

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const attendance = await Attendance.find(filter)
      .sort({ date: -1 })
      .lean();

    // Calculate stats
    const stats = {
      total: attendance.length,
      present: attendance.filter(a => a.status === 'present').length,
      late: attendance.filter(a => a.status === 'late').length,
      absent: attendance.filter(a => a.status === 'absent').length,
      averageHours: attendance.reduce((sum, a) => sum + (a.totalHours || 0), 0) / attendance.length || 0
    };

    res.status(200).json({
      success: true,
      data: attendance,
      stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attendance',
      error: error.message
    });
  }
};

/**
 * @desc    Get leave balance
 * @route   GET /api/employee/leave-balance
 * @access  Private (Employee only)
 */
exports.getLeaveBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('leaveBalance');

    res.status(200).json({
      success: true,
      data: user.leaveBalance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leave balance',
      error: error.message
    });
  }
};

/**
 * @desc    Get team members (same department)
 * @route   GET /api/employee/team
 * @access  Private (Employee only)
 */
exports.getTeamMembers = async (req, res) => {
  try {
    const currentUser = await User.findById(req.user._id);

    const teamMembers = await User.find({
      company: currentUser.company,
      department: currentUser.department,
      role: 'employee',
      _id: { $ne: req.user._id } // Exclude current user
    })
      .select('name email position profilePhoto status')
      .lean();

    res.status(200).json({
      success: true,
      count: teamMembers.length,
      data: teamMembers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team members',
      error: error.message
    });
  }
};

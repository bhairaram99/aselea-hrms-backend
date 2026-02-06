/**
 * ADMIN CONTROLLER - Handles admin-level operations
 * 
 * Provides dashboard statistics and company-wide management
 */

const User = require('../models/User.model');
const Company = require('../models/Company.model');
const Leave = require('../models/Leave.model');
const Task = require('../models/Task.model');
const Expense = require('../models/Expense.model');
const { Attendance } = require('../models/Attendance.model');
const cloudinary = require('../config/cloudinary.config');

/**
 * @desc    Get admin dashboard statistics
 * @route   GET /api/admin/dashboard
 * @access  Private (Admin only)
 */
exports.getDashboardStats = async (req, res) => {
  try {
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get counts
    const [
      totalCompanies,
      totalHR,
      totalEmployees,
      activeToday,
      pendingLeaves,
      activeTasks,
      pendingExpensesData
    ] = await Promise.all([
      Company.countDocuments(),
      User.countDocuments({ role: 'hr' }),
      User.countDocuments({ role: 'employee' }),
      // Active today = employees who checked in today
      Attendance.countDocuments({
        date: { $gte: today, $lt: tomorrow },
        'checkIn.time': { $exists: true }
      }),
      // Pending leaves from both employees and HR
      Leave.countDocuments({ status: 'pending' }),
      // Active tasks (todo + in-progress)
      Task.countDocuments({ status: { $in: ['todo', 'in-progress'] } }),
      // Get pending expenses with sum
      Expense.aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ])
    ]);

    // Calculate pending expenses total in INR
    const pendingExpensesTotal = pendingExpensesData.length > 0 ? pendingExpensesData[0].total : 0;
    const pendingExpensesCount = pendingExpensesData.length > 0 ? pendingExpensesData[0].count : 0;

    // System Health Metrics
    const memoryUsage = process.memoryUsage();
    const serverLoad = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

    // Get Cloudinary storage usage
    let cloudinaryStorage = 0;
    try {
      const usage = await cloudinary.api.usage();
      // Calculate percentage of plan limit (default free tier is 25GB)
      const planLimit = usage.plan?.credits || 25000000000; // 25GB in bytes
      const usedBytes = usage.storage?.usage || 0;
      cloudinaryStorage = Math.round((usedBytes / planLimit) * 100);
    } catch (cloudinaryError) {
      console.log('Could not fetch Cloudinary usage:', cloudinaryError.message);
    }

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalCompanies,
          totalHR,
          totalEmployees,
          activeToday,
          pendingLeaves,
          activeTasks,
          pendingExpenses: pendingExpensesTotal,
          pendingExpensesCount
        },
        systemHealth: {
          serverLoad,
          database: 0, // Placeholder - requires MongoDB admin access
          storage: cloudinaryStorage
        },
        alerts: []
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin dashboard stats',
      error: error.message
    });
  }
};

/**
 * @desc    Get all companies with stats
 * @route   GET /api/admin/companies
 * @access  Private (Admin only)
 */
exports.getAllCompanies = async (req, res) => {
  try {
    const companies = await Company.find()
      .populate('hrManager', 'name email')
      .lean();

    // Get employee and HR counts for each company
    const companiesWithStats = await Promise.all(
      companies.map(async (company) => {
        const employeeCount = await User.countDocuments({
          company: company._id,
          role: 'employee'
        });
        const hrCount = await User.countDocuments({
          company: company._id,
          role: 'hr'
        });

        return {
          ...company,
          employeeCount,
          hrCount
        };
      })
    );

    res.status(200).json({
      success: true,
      count: companiesWithStats.length,
      data: companiesWithStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch companies',
      error: error.message
    });
  }
};

/**
 * @desc    Get all HR accounts
 * @route   GET /api/admin/hr-accounts
 * @access  Private (Admin only)
 */
exports.getAllHR = async (req, res) => {
  try {
    const hrAccounts = await User.find({ role: 'hr' })
      .populate('company', 'name email')
      .select('-password')
      .lean();

    res.status(200).json({
      success: true,
      count: hrAccounts.length,
      data: hrAccounts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch HR accounts',
      error: error.message
    });
  }
};

/**
 * @desc    Get all employees across companies
 * @route   GET /api/admin/employees
 * @access  Private (Admin only)
 */
exports.getAllEmployees = async (req, res) => {
  try {
    const { company, department, status } = req.query;

    const filter = { role: 'employee' };
    if (company) filter.company = company;
    if (department) filter.department = department;
    if (status) filter.status = status;

    const employees = await User.find(filter)
      .populate('company', 'name')
      .select('-password')
      .lean();

    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees',
      error: error.message
    });
  }
};

/**
 * @desc    Get all leaves across companies
 * @route   GET /api/admin/leaves
 * @access  Private (Admin only)
 */
exports.getAllLeaves = async (req, res) => {
  try {
    const { status, company } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (company) filter.company = company;

    const leaves = await Leave.find(filter)
      .populate('user', 'name email employeeId')
      .populate('company', 'name')
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
 * @desc    Get all tasks across companies
 * @route   GET /api/admin/tasks
 * @access  Private (Admin only)
 */
exports.getAllTasks = async (req, res) => {
  try {
    const { status, company } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (company) filter.company = company;

    const tasks = await Task.find(filter)
      .populate('assignedTo', 'name email employeeId')
      .populate('assignedBy', 'name email')
      .populate('company', 'name')
      .sort({ createdAt: -1 })
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
 * @desc    Get HR account details with company info
 * @route   GET /api/admin/hr/:id
 * @access  Private (Admin only)
 */
exports.getHRDetail = async (req, res) => {
  try {
    const hr = await User.findOne({ _id: req.params.id, role: 'hr' })
      .populate('company')
      .select('-password')
      .lean();

    if (!hr) {
      return res.status(404).json({
        success: false,
        message: 'HR account not found'
      });
    }

    // Get employee count managed by this HR (only if company exists)
    let employeeCount = 0;
    if (hr.company && hr.company._id) {
      employeeCount = await User.countDocuments({
        company: hr.company._id,
        role: 'employee'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...hr,
        employeeCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch HR details',
      error: error.message
    });
  }
};

/**
 * @desc    Get system activity logs (recent actions)
 * @route   GET /api/admin/activity
 * @access  Private (Admin only)
 */
exports.getRecentActivity = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    // Get recent leaves
    const recentLeaves = await Leave.find()
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .limit(Math.ceil(limit / 4))
      .lean();

    // Get recent tasks
    const recentTasks = await Task.find()
      .populate('assignedTo', 'name')
      .populate('assignedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(Math.ceil(limit / 4))
      .lean();

    // Get recent expenses
    const recentExpenses = await Expense.find()
      .populate('user', 'name')
      .sort({ createdAt: -1 })
      .limit(Math.ceil(limit / 4))
      .lean();

    // Get recent attendance
    const recentAttendance = await Attendance.find()
      .populate('user', 'name')
      .sort({ date: -1 })
      .limit(Math.ceil(limit / 4))
      .lean();

    // Combine and format activities
    const activities = [
      ...recentLeaves.map(l => ({
        type: 'leave',
        action: `Leave request ${l.status}`,
        user: l.user?.name || 'Unknown',
        time: l.createdAt,
        status: l.status
      })),
      ...recentTasks.map(t => ({
        type: 'task',
        action: `Task ${t.status}`,
        user: t.assignedTo?.name || 'Unknown',
        time: t.createdAt,
        status: t.status
      })),
      ...recentExpenses.map(e => ({
        type: 'expense',
        action: `Expense claim ${e.status}`,
        user: e.user?.name || 'Unknown',
        time: e.createdAt,
        status: e.status
      })),
      ...recentAttendance.map(a => ({
        type: 'attendance',
        action: `Attendance marked`,
        user: a.user?.name || 'Unknown',
        time: a.date,
        status: a.status
      }))
    ];

    // Sort by time
    activities.sort((a, b) => new Date(b.time) - new Date(a.time));

    res.status(200).json({
      success: true,
      data: activities.slice(0, limit)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent activity',
      error: error.message
    });
  }
};

/**
 * @desc    Reset HR account password (admin only)
 * @route   POST /api/admin/hr/:id/reset-password
 * @access  Private (Admin only)
 */
exports.resetHRPassword = async (req, res, next) => {
  try {
    const { id } = req.params;

    const hrUser = await User.findById(id);

    if (!hrUser) {
      return res.status(404).json({
        success: false,
        message: 'HR account not found',
      });
    }

    if (hrUser.role !== 'hr') {
      return res.status(400).json({
        success: false,
        message: 'User is not an HR account',
      });
    }

    // Generate temporary password (8 characters: letters + numbers)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let temporaryPassword = '';
    for (let i = 0; i < 12; i++) {
      temporaryPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    hrUser.password = await bcrypt.hash(temporaryPassword, salt);

    await hrUser.save({ validateBeforeSave: false });

    // Send email with temporary password
    const emailService = require('../utils/emailService');
    let emailSent = false;
    try {
      await emailService.sendEmail({
        email: hrUser.email,
        subject: 'Password Reset - HRMS',
        message: `Your password has been reset by the administrator.\n\nTemporary Password: ${temporaryPassword}\n\nPlease change your password after logging in for security purposes.`,
      });
      emailSent = true;
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      // Continue even if email fails
    }

    res.status(200).json({
      success: true,
      message: emailSent 
        ? 'Password reset successfully. Temporary password sent to email.' 
        : 'Password reset successfully. Email could not be sent.',
      // Only return password if email failed
      ...(emailSent ? {} : { temporaryPassword }),
    });
  } catch (error) {
    next(error);
  }
};


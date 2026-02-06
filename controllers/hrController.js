/**
 * HR CONTROLLER - Handles HR-specific operations
 * 
 * Provides HR dashboard statistics and employee management within company scope
 */

const User = require('../models/User.model');
const Leave = require('../models/Leave.model');
const Task = require('../models/Task.model');
const Expense = require('../models/Expense.model');
const { Attendance } = require('../models/Attendance.model');
const Announcement = require('../models/Announcement.model');
const { uploadToCloudinary } = require('../utils/uploadToCloudinary');

/**
 * @desc    Get HR dashboard statistics
 * @route   GET /api/hr/dashboard
 * @access  Private (HR only)
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const companyId = req.user.company;
    console.log('HR Dashboard - Company ID:', companyId);
    console.log('HR Dashboard - User:', req.user.email);

    // If HR doesn't have a company assigned, return zero stats
    if (!companyId) {
      return res.status(200).json({
        success: true,
        data: {
          stats: {
            totalEmployees: 0,
            presentToday: 0,
            pendingLeaves: 0,
            activeTasks: 0
          }
        },
        message: 'HR account not associated with a company yet'
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Total Employees - All employees added by admin and HR in this company
    const totalEmployees = await User.countDocuments({ 
      company: companyId, 
      role: 'employee' 
    });
    console.log('Total Employees:', totalEmployees);

    // 2. Present Today - Count attendance records for today for this company
    // Check attendance directly by company field OR by user's company
    const presentToday = await Attendance.countDocuments({ 
      company: companyId,
      date: { $gte: today },
      checkIn: { $exists: true, $ne: null }
    });
    console.log('Present Today (by company):', presentToday);

    // If company-based count is 0, try counting by employee user IDs
    let actualPresentToday = presentToday;
    if (presentToday === 0) {
      const companyEmployees = await User.find({ 
        company: companyId, 
        role: 'employee' 
      }).select('_id');
      const employeeIds = companyEmployees.map(e => e._id);
      
      actualPresentToday = await Attendance.countDocuments({ 
        user: { $in: employeeIds },
        date: { $gte: today },
        checkIn: { $exists: true, $ne: null }
      });
      console.log('Present Today (by user IDs):', actualPresentToday);
    }

    // 3. Pending Leaves - Leave requests awaiting approval
    const pendingLeaves = await Leave.countDocuments({ 
      company: companyId, 
      status: 'pending' 
    });
    console.log('Pending Leaves:', pendingLeaves);

    // 4. Active Tasks - All tasks assigned to employees (not completed)
    const activeTasks = await Task.countDocuments({ 
      company: companyId, 
      status: { $in: ['todo', 'in-progress', 'pending', 'assigned'] }
    });
    console.log('Active Tasks:', activeTasks);

    res.status(200).json({
      success: true,
      data: {
        stats: {
          totalEmployees,
          presentToday: actualPresentToday,
          pendingLeaves,
          activeTasks
        }
      }
    });
  } catch (error) {
    console.error('HR Dashboard Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch HR dashboard stats',
      error: error.message
    });
  }
};

/**
 * @desc    Get all employees in company
 * @route   GET /api/hr/employees
 * @access  Private (HR only)
 */
exports.getEmployees = async (req, res) => {
  try {
    const companyId = req.user.company;
    const { department, status, search } = req.query;

    const filter = { company: companyId, role: 'employee' };
    if (department) filter.department = department;
    if (status) filter.status = status;

    // Add search functionality
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    const employees = await User.find(filter)
      .select('-password')
      .populate('reportingTo', 'name email position')
      .sort({ createdAt: -1 })
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
 * @desc    Get employee details
 * @route   GET /api/hr/employees/:id
 * @access  Private (HR only)
 */
exports.getEmployeeDetail = async (req, res) => {
  try {
    const companyId = req.user.company;
    const employee = await User.findOne({
      _id: req.params.id,
      company: companyId,
      role: 'employee'
    })
      .select('-password')
      .populate('company', 'name email')
      .populate('reportingTo', 'name email position')
      .lean();

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Get additional stats
    const today = new Date();
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      activeTasks,
      pendingLeaves,
      currentMonthAttendance,
      totalExpenses
    ] = await Promise.all([
      Task.countDocuments({ 
        assignedTo: employee._id,
        status: { $in: ['todo', 'in-progress'] }
      }),
      Leave.countDocuments({ 
        user: employee._id,
        status: 'pending'
      }),
      Attendance.countDocuments({
        user: employee._id,
        date: { $gte: currentMonth },
        checkIn: { $exists: true }
      }),
      Expense.aggregate([
        { $match: { employee: employee._id } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        ...employee,
        stats: {
          activeTasks,
          pendingLeaves,
          attendanceThisMonth: currentMonthAttendance,
          totalExpenses: totalExpenses[0]?.total || 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee details',
      error: error.message
    });
  }
};

/**
 * @desc    Create employee
 * @route   POST /api/hr/employees
 * @access  Private (HR only)
 */
exports.createEmployee = async (req, res) => {
  try {
    const companyId = req.user.company;

    // Check if employee ID or email already exists
    const existingUser = await User.findOne({
      $or: [
        { email: req.body.email },
        { employeeId: req.body.employeeId }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or employee ID already exists'
      });
    }

    // Handle profile photo upload
    let profilePhoto = null;
    if (req.file) {
      try {
        console.log('📸 HR: Uploading profile photo to Cloudinary...');
        const uploadResult = await uploadToCloudinary(req.file.buffer, { folder: 'profile-photos' });
        profilePhoto = {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id
        };
        console.log('✅ HR: Profile photo uploaded:', profilePhoto.url);
      } catch (uploadError) {
        console.error('❌ HR: Profile photo upload error:', uploadError);
        // Continue without photo if upload fails
      }
    } else {
      console.log('📷 HR: No profile photo file received in request');
    }

    const employee = await User.create({
      ...req.body,
      company: companyId,
      role: 'employee',
      profilePhoto
    });

    // Remove password from response
    employee.password = undefined;

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: employee
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create employee',
      error: error.message
    });
  }
};

/**
 * @desc    Update employee
 * @route   PUT /api/hr/employees/:id
 * @access  Private (HR only)
 */
exports.updateEmployee = async (req, res) => {
  try {
    const companyId = req.user.company;

    // Don't allow updating password, role, or company through this route
    delete req.body.password;
    delete req.body.role;
    delete req.body.company;

    const employee = await User.findOneAndUpdate(
      { _id: req.params.id, company: companyId, role: 'employee' },
      req.body,
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
      message: 'Employee updated successfully',
      data: employee
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update employee',
      error: error.message
    });
  }
};

/**
 * @desc    Delete employee
 * @route   DELETE /api/hr/employees/:id
 * @access  Private (HR only)
 */
exports.deleteEmployee = async (req, res) => {
  try {
    const companyId = req.user.company;

    const employee = await User.findOneAndDelete({
      _id: req.params.id,
      company: companyId,
      role: 'employee'
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Employee deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete employee',
      error: error.message
    });
  }
};

/**
 * @desc    Get today's attendance for company
 * @route   GET /api/hr/attendance/today
 * @access  Private (HR only)
 */
exports.getTodayAttendance = async (req, res) => {
  try {
    const companyId = req.user.company;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.find({
      company: companyId,
      date: { $gte: today }
    })
      .populate('user', 'name email employeeId profilePhoto')
      .sort({ checkIn: -1 })
      .lean();

    // Get all employees to find who hasn't checked in
    const allEmployees = await User.find({
      company: companyId,
      role: 'employee',
      status: 'active'
    }).select('name email employeeId profilePhoto').lean();

    const checkedInIds = attendance.map(a => a.user._id.toString());
    const absent = allEmployees.filter(
      emp => !checkedInIds.includes(emp._id.toString())
    );

    // Calculate stats
    const stats = {
      present: attendance.filter(a => a.status === 'present').length,
      late: attendance.filter(a => a.status === 'late').length,
      absent: absent.length,
      onLeave: await User.countDocuments({
        company: companyId,
        role: 'employee',
        status: 'on-leave'
      })
    };

    res.status(200).json({
      success: true,
      data: {
        attendance,
        absent,
        stats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today\'s attendance',
      error: error.message
    });
  }
};

/**
 * @desc    Get pending leave requests
 * @route   GET /api/hr/leaves/pending
 * @access  Private (HR only)
 */
exports.getPendingLeaves = async (req, res) => {
  try {
    const companyId = req.user.company;

    const leaves = await Leave.find({
      company: companyId,
      status: 'pending'
    })
      .populate('user', 'name email employeeId profilePhoto')
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
      message: 'Failed to fetch pending leaves',
      error: error.message
    });
  }
};

/**
 * @desc    Get pending expense claims
 * @route   GET /api/hr/expenses/pending
 * @access  Private (HR only)
 */
exports.getPendingExpenses = async (req, res) => {
  try {
    const companyId = req.user.company;

    const expenses = await Expense.find({
      company: companyId,
      status: 'pending'
    })
      .populate('user', 'name email employeeId profilePhoto')
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
      message: 'Failed to fetch pending expenses',
      error: error.message
    });
  }
};

/**
 * @desc    Get department statistics
 * @route   GET /api/hr/departments/stats
 * @access  Private (HR only)
 */
exports.getDepartmentStats = async (req, res) => {
  try {
    const companyId = req.user.company;

    const departmentStats = await User.aggregate([
      { $match: { company: companyId, role: 'employee' } },
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: departmentStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department statistics',
      error: error.message
    });
  }
};

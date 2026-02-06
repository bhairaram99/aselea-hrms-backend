const express = require('express');
const { protect, authorize } = require('../middleware/auth.middleware');
const employeeController = require('../controllers/employeeController');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Employee dashboard and stats
router.get('/dashboard', authorize('employee'), employeeController.getDashboardStats);

// Profile management
router.get('/profile', authorize('employee'), employeeController.getProfile);
router.put('/profile', authorize('employee'), upload.single('profilePhoto'), employeeController.updateProfile);
router.put('/change-password', authorize('employee'), employeeController.changePassword);

// Employee's own data
router.get('/tasks', authorize('employee'), employeeController.getMyTasks);
router.get('/leaves', authorize('employee'), employeeController.getMyLeaves);
router.get('/expenses', authorize('employee'), employeeController.getMyExpenses);
router.get('/attendance', authorize('employee'), employeeController.getMyAttendance);
router.get('/leave-balance', authorize('employee'), employeeController.getLeaveBalance);

// Team and collaboration
router.get('/team', authorize('employee'), employeeController.getTeamMembers);

module.exports = router;

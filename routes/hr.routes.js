/**
 * HR ROUTES - HR-specific endpoints
 */

const express = require('express');
const { protect, authorize } = require('../middleware/auth.middleware');
const hrController = require('../controllers/hrController');
const upload = require('../middleware/uploadMiddleware');

const router = express.Router();

// All routes require HR or Admin authentication
router.use(protect, authorize('hr', 'admin'));

// Dashboard and statistics
router.get('/dashboard', hrController.getDashboardStats);
router.get('/departments/stats', hrController.getDepartmentStats);

// Employee management within company
router.get('/employees', hrController.getEmployees);
router.get('/employees/:id', hrController.getEmployeeDetail);
router.post('/employees', upload.single('profilePhoto'), hrController.createEmployee);
router.put('/employees/:id', hrController.updateEmployee);
router.delete('/employees/:id', hrController.deleteEmployee);

// Attendance overview
router.get('/attendance/today', hrController.getTodayAttendance);

// Pending items
router.get('/leaves/pending', hrController.getPendingLeaves);
router.get('/expenses/pending', hrController.getPendingExpenses);

module.exports = router;

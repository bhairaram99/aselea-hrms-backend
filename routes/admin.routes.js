/**
 * ADMIN ROUTES - Admin-specific endpoints
 */

const express = require('express');
const { protect, authorize } = require('../middleware/auth.middleware');
const adminController = require('../controllers/adminController');

const router = express.Router();

// All routes require admin authentication
router.use(protect, authorize('admin'));

// Dashboard and statistics
router.get('/dashboard', adminController.getDashboardStats);
router.get('/activity', adminController.getRecentActivity);

// Company management
router.get('/companies', adminController.getAllCompanies);

// HR management
router.get('/hr-accounts', adminController.getAllHR);
router.get('/hr/:id', adminController.getHRDetail);
router.post('/hr/:id/reset-password', adminController.resetHRPassword);


// Employee management (cross-company)
router.get('/employees', adminController.getAllEmployees);

// Leave management (cross-company)
router.get('/leaves', adminController.getAllLeaves);

// Task management (cross-company)
router.get('/tasks', adminController.getAllTasks);

module.exports = router;

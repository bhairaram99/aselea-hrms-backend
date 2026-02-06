/**
 * EXPENSE ROUTES - Endpoints for expense management
 * 
 * WHY: Defines all expense-related routes with proper validation,
 * authorization, and lifecycle management.
 */

const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middleware/auth.middleware');
const { validateExpense, validateObjectId, validateDateRange } = require('../middleware/validator');
const { enforceCompanyAccess } = require('../middleware/companyIsolation.middleware');
const upload = require('../middleware/uploadMiddleware');
const expenseController = require('../controllers/expenseController');
const Expense = require('../models/Expense.model');

// All routes require authentication
router.use(protect);

/**
 * @route   GET /api/expenses/statistics
 * @desc    Get expense statistics
 * @access  Private (All authenticated users)
 */
router.get('/statistics', validateDateRange, expenseController.getExpenseStatistics);

/**
 * @route   POST /api/expenses
 * @desc    Create new expense
 * @access  Private (All authenticated users)
 */
router.post('/', upload.single('receipt'), validateExpense, expenseController.createExpense);

/**
 * @route   GET /api/expenses
 * @desc    Get all expenses (filtered by role)
 * @access  Private (All authenticated users)
 */
router.get('/', validateDateRange, expenseController.getExpenses);

/**
 * @route   GET /api/expenses/:id
 * @desc    Get single expense
 * @access  Private (All authenticated users)
 */
router.get(
  '/:id',
  validateObjectId('id'),
  enforceCompanyAccess(Expense),
  expenseController.getExpenseById
);

/**
 * @route   PUT /api/expenses/:id
 * @desc    Update expense
 * @access  Private (All authenticated users - with permission check in controller)
 */
router.put(
  '/:id',
  validateObjectId('id'),
  enforceCompanyAccess(Expense),
  expenseController.updateExpense
);

/**
 * @route   PUT /api/expenses/:id/approve
 * @desc    Approve expense
 * @access  Private (HR, Admin)
 */
router.put(
  '/:id/approve',
  authorize('admin', 'hr'),
  validateObjectId('id'),
  enforceCompanyAccess(Expense),
  expenseController.approveExpense
);

/**
 * @route   PUT /api/expenses/:id/reject
 * @desc    Reject expense
 * @access  Private (HR, Admin)
 */
router.put(
  '/:id/reject',
  authorize('admin', 'hr'),
  validateObjectId('id'),
  enforceCompanyAccess(Expense),
  expenseController.rejectExpense
);

/**
 * @route   PUT /api/expenses/:id/pay
 * @desc    Mark expense as paid
 * @access  Private (Admin)
 */
router.put(
  '/:id/pay',
  authorize('admin'),
  validateObjectId('id'),
  enforceCompanyAccess(Expense),
  expenseController.markAsPaid
);

/**
 * @route   DELETE /api/expenses/:id
 * @desc    Delete expense
 * @access  Private (All authenticated users - with permission check in controller)
 */
router.delete(
  '/:id',
  validateObjectId('id'),
  enforceCompanyAccess(Expense),
  expenseController.deleteExpense
);

module.exports = router;


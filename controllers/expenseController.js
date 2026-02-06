/**
 * EXPENSE CONTROLLER - Request handlers for expense management
 * 
 * WHY: Handles expense lifecycle with status transitions and locking.
 * Prevents modifications after approval/rejection.
 */

const expenseService = require('../services/expense.service');
const { HTTP_STATUS, SUCCESS_MESSAGES, ROLES } = require('../constants');

/**
 * @desc    Create expense
 * @route   POST /api/expenses
 * @access  Private
 */
exports.createExpense = async (req, res) => {
  try {
    const userId = req.user._id;
    const companyId = req.user.company || null; // Optional: Allow null company
    
    // Handle receipt file upload if present
    let receiptData = null;
    if (req.file) {
      try {
        const { uploadToCloudinary } = require('../utils/uploadToCloudinary');
        const result = await uploadToCloudinary(req.file.buffer, { 
          folder: 'expense-receipts',
          resource_type: 'auto'
        });
        receiptData = {
          url: result.secure_url,
          publicId: result.public_id
        };
      } catch (uploadError) {
        console.error('Receipt upload error:', uploadError);
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Failed to upload receipt',
          error: uploadError.message
        });
      }
    }
    
    const expenseData = {
      ...req.body,
      receipt: receiptData
    };
    
    const expense = await expenseService.createExpense(userId, companyId, expenseData);
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: SUCCESS_MESSAGES.EXPENSE_CREATED,
      data: expense
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get all expenses
 * @route   GET /api/expenses
 * @access  Private
 */
exports.getExpenses = async (req, res) => {
  try {
    const companyId = req.user.company;
    const filters = { ...req.query };
    
    // If employee, only show their expenses
    if (req.user.role === ROLES.EMPLOYEE) {
      filters.userId = req.user._id;
    }
    
    const expenses = await expenseService.getExpenses(companyId, filters);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      count: expenses.length,
      data: expenses
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get single expense
 * @route   GET /api/expenses/:id
 * @access  Private
 */
exports.getExpenseById = async (req, res) => {
  try {
    const expense = await expenseService.getExpenseById(
      req.params.id,
      req.user._id,
      req.user.role,
      req.user.company
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: expense
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Update expense
 * @route   PUT /api/expenses/:id
 * @access  Private
 */
exports.updateExpense = async (req, res) => {
  try {
    const expense = await expenseService.updateExpense(
      req.params.id,
      req.body,
      req.user._id,
      req.user.role
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.EXPENSE_UPDATED,
      data: expense
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Approve expense
 * @route   PUT /api/expenses/:id/approve
 * @access  Private (HR, Admin)
 */
exports.approveExpense = async (req, res) => {
  try {
    const { reviewNote } = req.body;
    const reviewerId = req.user._id;
    
    const expense = await expenseService.approveExpense(
      req.params.id,
      reviewerId,
      reviewNote
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.EXPENSE_APPROVED,
      data: expense
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Reject expense
 * @route   PUT /api/expenses/:id/reject
 * @access  Private (HR, Admin)
 */
exports.rejectExpense = async (req, res) => {
  try {
    const { reviewNote } = req.body;
    const reviewerId = req.user._id;
    
    if (!reviewNote) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Review note is required when rejecting expense'
      });
    }
    
    const expense = await expenseService.rejectExpense(
      req.params.id,
      reviewerId,
      reviewNote
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.EXPENSE_REJECTED,
      data: expense
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Mark expense as paid
 * @route   PUT /api/expenses/:id/pay
 * @access  Private (Admin)
 */
exports.markAsPaid = async (req, res) => {
  try {
    const paidById = req.user._id;
    
    const expense = await expenseService.markAsPaid(req.params.id, paidById);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Expense marked as paid successfully',
      data: expense
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Delete expense
 * @route   DELETE /api/expenses/:id
 * @access  Private
 */
exports.deleteExpense = async (req, res) => {
  try {
    await expenseService.deleteExpense(
      req.params.id,
      req.user._id,
      req.user.role
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get expense statistics
 * @route   GET /api/expenses/statistics
 * @access  Private
 */
exports.getExpenseStatistics = async (req, res) => {
  try {
    const companyId = req.user.company;
    const filters = { ...req.query };
    
    // If employee, only show their statistics
    if (req.user.role === ROLES.EMPLOYEE) {
      filters.userId = req.user._id;
    }
    
    const stats = await expenseService.getExpenseStatistics(companyId, filters);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

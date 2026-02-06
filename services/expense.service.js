/**
 * EXPENSE SERVICE - Business logic for expense management
 * 
 * WHY: Handles expense lifecycle, status transitions, locking after approval,
 * and ensures data integrity throughout the expense workflow.
 */

const Expense = require('../models/Expense.model');
const { 
  EXPENSE_STATUS, 
  EXPENSE_CATEGORY,
  ROLES,
  ERROR_MESSAGES 
} = require('../constants');

/**
 * Check if expense can be modified
 */
const canModifyExpense = (expense, userId, userRole) => {
  // Cannot modify locked expenses
  if (expense.isLocked) {
    return false;
  }
  
  // Admin and HR can modify expenses in their company
  if (userRole === ROLES.ADMIN || userRole === ROLES.HR) {
    return true;
  }
  
  // Employees can only modify their own expenses
  if (userRole === ROLES.EMPLOYEE) {
    if (expense.user.toString() === userId.toString()) {
      // Can only modify if status is draft or pending
      if (expense.status === EXPENSE_STATUS.DRAFT || 
          expense.status === EXPENSE_STATUS.PENDING) {
        return true;
      }
    }
  }
  
  return false;
};

/**
 * Validate status transition
 */
const isValidStatusTransition = (currentStatus, newStatus, userRole) => {
  const transitions = {
    [EXPENSE_STATUS.DRAFT]: [EXPENSE_STATUS.PENDING, EXPENSE_STATUS.DRAFT],
    [EXPENSE_STATUS.PENDING]: [EXPENSE_STATUS.APPROVED, EXPENSE_STATUS.REJECTED, EXPENSE_STATUS.DRAFT],
    [EXPENSE_STATUS.APPROVED]: [EXPENSE_STATUS.PAID],
    [EXPENSE_STATUS.REJECTED]: [], // Cannot transition from rejected
    [EXPENSE_STATUS.PAID]: []      // Cannot transition from paid
  };
  
  // Only HR/Admin can approve/reject/mark as paid
  if ([EXPENSE_STATUS.APPROVED, EXPENSE_STATUS.REJECTED, EXPENSE_STATUS.PAID].includes(newStatus)) {
    if (userRole !== ROLES.HR && userRole !== ROLES.ADMIN) {
      return false;
    }
  }
  
  return transitions[currentStatus]?.includes(newStatus) || false;
};

/**
 * Create expense
 */
const createExpense = async (userId, companyId, expenseData) => {
  const {
    category,
    amount,
    currency,
    date,
    description,
    receipt,
    status
  } = expenseData;
  
  // Validate amount
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0');
  }
  
  // Validate required fields
  if (!category || !amount || !date || !description) {
    throw new Error(ERROR_MESSAGES.REQUIRED_FIELDS);
  }
  
  // Validate category
  if (!Object.values(EXPENSE_CATEGORY).includes(category)) {
    throw new Error('Invalid expense category');
  }
  
  // Set initial status
  const initialStatus = status || EXPENSE_STATUS.PENDING;
  
  const expense = await Expense.create({
    user: userId,
    company: companyId,
    category,
    amount,
    currency: currency || 'USD',
    date: new Date(date),
    description,
    receipt: receipt || null,
    status: initialStatus,
    isLocked: false
  });
  
  await expense.populate('user', 'name employeeId department position');
  
  return expense;
};

/**
 * Update expense
 */
const updateExpense = async (expenseId, updateData, userId, userRole) => {
  const expense = await Expense.findById(expenseId);
  
  if (!expense) {
    throw new Error('Expense not found');
  }
  
  // Check if can modify
  if (!canModifyExpense(expense, userId, userRole)) {
    throw new Error(ERROR_MESSAGES.EXPENSE_LOCKED);
  }
  
  // Validate status transition if status is being updated
  if (updateData.status) {
    if (!isValidStatusTransition(expense.status, updateData.status, userRole)) {
      throw new Error(ERROR_MESSAGES.INVALID_STATUS_TRANSITION);
    }
  }
  
  // Update allowed fields
  const allowedUpdates = [
    'category',
    'amount',
    'currency',
    'date',
    'description',
    'receipt',
    'status'
  ];
  
  Object.keys(updateData).forEach(key => {
    if (allowedUpdates.includes(key)) {
      // Validate amount if being updated
      if (key === 'amount' && updateData[key] <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      expense[key] = updateData[key];
    }
  });
  
  await expense.save();
  await expense.populate([
    { path: 'user', select: 'name employeeId department position' },
    { path: 'reviewedBy', select: 'name employeeId' }
  ]);
  
  return expense;
};

/**
 * Approve expense
 */
const approveExpense = async (expenseId, reviewerId, reviewNote) => {
  const expense = await Expense.findById(expenseId);
  
  if (!expense) {
    throw new Error('Expense not found');
  }
  
  if (expense.status !== EXPENSE_STATUS.PENDING) {
    throw new Error(ERROR_MESSAGES.INVALID_STATUS_TRANSITION);
  }
  
  expense.status = EXPENSE_STATUS.APPROVED;
  expense.reviewedBy = reviewerId;
  expense.reviewedAt = new Date();
  expense.reviewNote = reviewNote;
  expense.isLocked = true; // Lock after approval
  
  await expense.save();
  await expense.populate([
    { path: 'user', select: 'name employeeId department position' },
    { path: 'reviewedBy', select: 'name employeeId' }
  ]);
  
  return expense;
};

/**
 * Reject expense
 */
const rejectExpense = async (expenseId, reviewerId, reviewNote) => {
  const expense = await Expense.findById(expenseId);
  
  if (!expense) {
    throw new Error('Expense not found');
  }
  
  if (expense.status !== EXPENSE_STATUS.PENDING) {
    throw new Error(ERROR_MESSAGES.INVALID_STATUS_TRANSITION);
  }
  
  if (!reviewNote) {
    throw new Error('Review note is required when rejecting expense');
  }
  
  expense.status = EXPENSE_STATUS.REJECTED;
  expense.reviewedBy = reviewerId;
  expense.reviewedAt = new Date();
  expense.reviewNote = reviewNote;
  expense.isLocked = true; // Lock after rejection
  
  await expense.save();
  await expense.populate([
    { path: 'user', select: 'name employeeId department position' },
    { path: 'reviewedBy', select: 'name employeeId' }
  ]);
  
  return expense;
};

/**
 * Mark expense as paid
 */
const markAsPaid = async (expenseId, paidById) => {
  const expense = await Expense.findById(expenseId);
  
  if (!expense) {
    throw new Error('Expense not found');
  }
  
  if (expense.status !== EXPENSE_STATUS.APPROVED) {
    throw new Error('Can only mark approved expenses as paid');
  }
  
  expense.status = EXPENSE_STATUS.PAID;
  expense.paidBy = paidById;
  expense.paidAt = new Date();
  
  await expense.save();
  await expense.populate([
    { path: 'user', select: 'name employeeId department position' },
    { path: 'reviewedBy', select: 'name employeeId' },
    { path: 'paidBy', select: 'name employeeId' }
  ]);
  
  return expense;
};

/**
 * Delete expense
 */
const deleteExpense = async (expenseId, userId, userRole) => {
  const expense = await Expense.findById(expenseId);
  
  if (!expense) {
    throw new Error('Expense not found');
  }
  
  // Cannot delete locked expenses
  if (expense.isLocked) {
    throw new Error('Cannot delete approved or rejected expenses');
  }
  
  // Check permissions
  if (userRole === ROLES.EMPLOYEE) {
    if (expense.user.toString() !== userId.toString()) {
      throw new Error(ERROR_MESSAGES.FORBIDDEN);
    }
  }
  
  await Expense.findByIdAndDelete(expenseId);
  return expense;
};

/**
 * Get expenses with filters
 */
const getExpenses = async (companyId, filters = {}) => {
  const query = { company: companyId };
  
  // User filter
  if (filters.userId) {
    query.user = filters.userId;
  }
  
  // Status filter
  if (filters.status) {
    query.status = filters.status;
  }
  
  // Category filter
  if (filters.category) {
    query.category = filters.category;
  }
  
  // Date range filter
  if (filters.startDate && filters.endDate) {
    query.date = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate)
    };
  }
  
  // Amount range filter
  if (filters.minAmount) {
    query.amount = { ...query.amount, $gte: parseFloat(filters.minAmount) };
  }
  
  if (filters.maxAmount) {
    query.amount = { ...query.amount, $lte: parseFloat(filters.maxAmount) };
  }
  
  const expenses = await Expense.find(query)
    .sort({ date: -1 })
    .populate('user', 'name employeeId department position')
    .populate('reviewedBy', 'name employeeId')
    .populate('paidBy', 'name employeeId');
  
  return expenses;
};

/**
 * Get single expense by ID
 */
const getExpenseById = async (expenseId, userId, userRole, companyId) => {
  const expense = await Expense.findById(expenseId)
    .populate('user', 'name employeeId department position')
    .populate('reviewedBy', 'name employeeId')
    .populate('paidBy', 'name employeeId');
  
  if (!expense) {
    throw new Error('Expense not found');
  }
  
  // Verify company access
  if (expense.company.toString() !== companyId.toString()) {
    throw new Error(ERROR_MESSAGES.COMPANY_ACCESS_DENIED);
  }
  
  // Employees can only view their own expenses
  if (userRole === ROLES.EMPLOYEE) {
    if (expense.user._id.toString() !== userId.toString()) {
      throw new Error(ERROR_MESSAGES.FORBIDDEN);
    }
  }
  
  return expense;
};

/**
 * Get expense statistics
 */
const getExpenseStatistics = async (companyId, filters = {}) => {
  const query = { company: companyId };
  
  // User filter
  if (filters.userId) {
    query.user = filters.userId;
  }
  
  // Date range filter
  if (filters.startDate && filters.endDate) {
    query.date = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate)
    };
  }
  
  const expenses = await Expense.find(query);
  
  const stats = {
    total: expenses.length,
    draft: expenses.filter(e => e.status === EXPENSE_STATUS.DRAFT).length,
    pending: expenses.filter(e => e.status === EXPENSE_STATUS.PENDING).length,
    approved: expenses.filter(e => e.status === EXPENSE_STATUS.APPROVED).length,
    rejected: expenses.filter(e => e.status === EXPENSE_STATUS.REJECTED).length,
    paid: expenses.filter(e => e.status === EXPENSE_STATUS.PAID).length,
    totalAmount: expenses.reduce((sum, e) => sum + e.amount, 0),
    approvedAmount: expenses
      .filter(e => e.status === EXPENSE_STATUS.APPROVED || e.status === EXPENSE_STATUS.PAID)
      .reduce((sum, e) => sum + e.amount, 0),
    paidAmount: expenses
      .filter(e => e.status === EXPENSE_STATUS.PAID)
      .reduce((sum, e) => sum + e.amount, 0),
    pendingAmount: expenses
      .filter(e => e.status === EXPENSE_STATUS.PENDING)
      .reduce((sum, e) => sum + e.amount, 0),
    byCategory: {}
  };
  
  // Calculate amounts by category
  Object.values(EXPENSE_CATEGORY).forEach(category => {
    stats.byCategory[category] = expenses
      .filter(e => e.category === category)
      .reduce((sum, e) => sum + e.amount, 0);
  });
  
  return stats;
};

module.exports = {
  createExpense,
  updateExpense,
  approveExpense,
  rejectExpense,
  markAsPaid,
  deleteExpense,
  getExpenses,
  getExpenseById,
  getExpenseStatistics,
  canModifyExpense
};

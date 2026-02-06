/**
 * TASK ROUTES - Endpoints for task management
 * 
 * WHY: Defines all task-related routes with proper validation,
 * authorization, and ownership rules enforcement.
 */

const express = require('express');
const router = express.Router();

const { protect, authorize } = require('../middleware/auth.middleware');
const { validateTask, validateObjectId } = require('../middleware/validator');
const { enforceCompanyAccess } = require('../middleware/companyIsolation.middleware');
const taskController = require('../controllers/taskController');
const Task = require('../models/Task.model');

// All routes require authentication
router.use(protect);

/**
 * @route   GET /api/tasks/statistics
 * @desc    Get task statistics
 * @access  Private (All authenticated users)
 */
router.get('/statistics', taskController.getTaskStatistics);

/**
 * @route   POST /api/tasks
 * @desc    Create new task
 * @access  Private (All authenticated users)
 */
router.post('/', validateTask, taskController.createTask);

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks (filtered by role)
 * @access  Private (All authenticated users)
 */
router.get('/', taskController.getTasks);

/**
 * @route   GET /api/tasks/:id
 * @desc    Get single task
 * @access  Private (All authenticated users)
 */
router.get(
  '/:id',
  validateObjectId('id'),
  enforceCompanyAccess(Task),
  taskController.getTaskById
);

/**
 * @route   PUT /api/tasks/:id
 * @desc    Update task
 * @access  Private (All authenticated users - with permission check in controller)
 */
router.put(
  '/:id',
  validateObjectId('id'),
  enforceCompanyAccess(Task),
  taskController.updateTask
);

/**
 * @route   PUT /api/tasks/:id/progress
 * @desc    Update task progress
 * @access  Private (All authenticated users)
 */
router.put(
  '/:id/progress',
  validateObjectId('id'),
  enforceCompanyAccess(Task),
  taskController.updateTaskProgress
);

/**
 * @route   POST /api/tasks/:id/attachments
 * @desc    Add attachment to task
 * @access  Private (All authenticated users)
 */
router.post(
  '/:id/attachments',
  validateObjectId('id'),
  enforceCompanyAccess(Task),
  taskController.addAttachment
);

/**
 * @route   PUT /api/tasks/:id/subtasks/:subTaskId
 * @desc    Update subtask completion status
 * @access  Private (All authenticated users)
 */
router.put(
  '/:id/subtasks/:subTaskId',
  validateObjectId('id'),
  taskController.updateSubTask
);

/**
 * @route   DELETE /api/tasks/:id
 * @desc    Delete task
 * @access  Private (All authenticated users - with permission check in controller)
 */
router.delete(
  '/:id',
  validateObjectId('id'),
  enforceCompanyAccess(Task),
  taskController.deleteTask
);

module.exports = router;


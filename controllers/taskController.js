/**
 * TASK CONTROLLER - Request handlers for task management
 * 
 * WHY: Handles task CRUD with role-based permissions and ownership rules.
 * Prevents employees from deleting HR/Admin assigned tasks.
 */

const taskService = require('../services/task.service');
const { HTTP_STATUS, SUCCESS_MESSAGES, ROLES } = require('../constants');

/**
 * @desc    Create task
 * @route   POST /api/tasks
 * @access  Private
 */
exports.createTask = async (req, res) => {
  try {
    const assignerId = req.user._id;
    const assignerRole = req.user.role;
    const companyId = req.user.company;
    
    if (!companyId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'User must be associated with a company'
      });
    }
    
    const task = await taskService.createTask(
      req.body,
      assignerId,
      assignerRole,
      companyId
    );
    
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: SUCCESS_MESSAGES.TASK_CREATED,
      data: task
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get all tasks
 * @route   GET /api/tasks
 * @access  Private
 */
exports.getTasks = async (req, res) => {
  try {
    const companyId = req.user.company;
    const filters = { ...req.query };
    
    // If employee, only show tasks assigned to or by them
    if (req.user.role === ROLES.EMPLOYEE) {
      filters.assignedTo = req.user._id;
    }
    
    const tasks = await taskService.getTasks(companyId, filters);
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      count: tasks.length,
      data: tasks
    });
  } catch (error) {
    res.status(HTTP_STATUS.SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get single task
 * @route   GET /api/tasks/:id
 * @access  Private
 */
exports.getTaskById = async (req, res) => {
  try {
    const task = await taskService.getTaskById(
      req.params.id,
      req.user._id,
      req.user.role,
      req.user.company
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: task
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Update task
 * @route   PUT /api/tasks/:id
 * @access  Private
 */
exports.updateTask = async (req, res) => {
  try {
    const task = await taskService.updateTask(
      req.params.id,
      req.body,
      req.user._id,
      req.user.role
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.TASK_UPDATED,
      data: task
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Update task progress
 * @route   PUT /api/tasks/:id/progress
 * @access  Private
 */
exports.updateTaskProgress = async (req, res) => {
  try {
    const { progress } = req.body;
    
    if (progress === undefined || progress === null) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Progress value is required'
      });
    }
    
    const task = await taskService.updateTaskProgress(
      req.params.id,
      parseInt(progress),
      req.user._id,
      req.user.role
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Task progress updated successfully',
      data: task
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Delete task
 * @route   DELETE /api/tasks/:id
 * @access  Private
 */
exports.deleteTask = async (req, res) => {
  try {
    await taskService.deleteTask(
      req.params.id,
      req.user._id,
      req.user.role
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: SUCCESS_MESSAGES.TASK_DELETED
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Add attachment to task
 * @route   POST /api/tasks/:id/attachments
 * @access  Private
 */
exports.addAttachment = async (req, res) => {
  try {
    const attachmentData = req.body;
    
    const task = await taskService.addTaskAttachment(
      req.params.id,
      attachmentData,
      req.user._id,
      req.user.role
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Attachment added successfully',
      data: task
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Update subtask
 * @route   PUT /api/tasks/:id/subtasks/:subTaskId
 * @access  Private
 */
exports.updateSubTask = async (req, res) => {
  try {
    const { completed } = req.body;
    
    if (completed === undefined) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Completed status is required'
      });
    }
    
    const task = await taskService.updateSubTask(
      req.params.id,
      req.params.subTaskId,
      completed,
      req.user._id,
      req.user.role
    );
    
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Subtask updated successfully',
      data: task
    });
  } catch (error) {
    res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * @desc    Get task statistics
 * @route   GET /api/tasks/statistics
 * @access  Private
 */
exports.getTaskStatistics = async (req, res) => {
  try {
    const stats = await taskService.getTaskStatistics(
      req.user.company,
      req.user._id,
      req.user.role
    );
    
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

/**
 * TASK SERVICE - Business logic for task management
 * 
 * WHY: Handles task ownership rules, prevents unauthorized deletions,
 * manages task lifecycle, and enforces role-based permissions.
 */

const Task = require('../models/Task.model');
const { 
  TASK_STATUS, 
  TASK_PRIORITY, 
  ROLES,
  ROLE_HIERARCHY,
  ERROR_MESSAGES 
} = require('../constants');

/**
 * Check if user can modify/delete a task
 */
const canModifyTask = (task, userId, userRole) => {
  // Admin can modify all tasks
  if (userRole === ROLES.ADMIN) {
    return true;
  }
  
  // HR can modify tasks in their company
  if (userRole === ROLES.HR) {
    return true;
  }
  
  // Employee can only modify tasks they created or are assigned to
  if (userRole === ROLES.EMPLOYEE) {
    // Can update tasks assigned to them
    if (task.assignedTo.toString() === userId.toString()) {
      return true;
    }
    // Can update tasks they created (if they're the assigner)
    if (task.assignedBy.toString() === userId.toString()) {
      return true;
    }
  }
  
  return false;
};

/**
 * Check if user can delete a task
 */
const canDeleteTask = (task, userId, userRole) => {
  // Admin can delete all tasks
  if (userRole === ROLES.ADMIN) {
    return true;
  }
  
  // HR can delete all tasks in their company
  if (userRole === ROLES.HR) {
    return true;
  }
  
  // Employee can only delete tasks they created AND if it's marked as deletable
  if (userRole === ROLES.EMPLOYEE) {
    // Cannot delete tasks assigned by HR/Admin
    if (task.createdBy === ROLES.HR || task.createdBy === ROLES.ADMIN) {
      if (!task.isDeletableByEmployee) {
        return false;
      }
    }
    
    // Can delete their own created tasks or if explicitly allowed
    if (task.assignedBy.toString() === userId.toString() || task.isDeletableByEmployee) {
      return true;
    }
  }
  
  return false;
};

/**
 * Create a new task
 */
const createTask = async (taskData, assignerId, assignerRole, companyId) => {
  const {
    title,
    description,
    assignedTo,
    priority,
    dueDate,
    subTasks,
    notes
  } = taskData;
  
  // Determine if task is deletable by employee
  const isDeletableByEmployee = assignerRole === ROLES.EMPLOYEE;
  
  const task = await Task.create({
    title,
    description,
    assignedTo,
    assignedBy: assignerId,
    company: companyId,
    priority: priority || TASK_PRIORITY.MEDIUM,
    status: TASK_STATUS.TODO,
    dueDate: dueDate ? new Date(dueDate) : null,
    subTasks: subTasks || [],
    notes,
    createdBy: assignerRole,
    isDeletableByEmployee
  });
  
  await task.populate([
    { path: 'assignedTo', select: 'name employeeId department position' },
    { path: 'assignedBy', select: 'name employeeId' }
  ]);
  
  return task;
};

/**
 * Update task
 */
const updateTask = async (taskId, updateData, userId, userRole) => {
  const task = await Task.findById(taskId);
  
  if (!task) {
    throw new Error(ERROR_MESSAGES.TASK_NOT_FOUND);
  }
  
  // Check permissions
  if (!canModifyTask(task, userId, userRole)) {
    throw new Error(ERROR_MESSAGES.FORBIDDEN);
  }
  
  // Prevent employees from changing certain fields on HR/Admin tasks
  if (userRole === ROLES.EMPLOYEE && 
      (task.createdBy === ROLES.HR || task.createdBy === ROLES.ADMIN)) {
    // Employees can only update progress and status on HR/Admin tasks
    const allowedFields = ['progress', 'status', 'notes'];
    const updatingRestrictedFields = Object.keys(updateData).some(
      key => !allowedFields.includes(key)
    );
    
    if (updatingRestrictedFields) {
      throw new Error('You can only update progress and status on tasks assigned by HR/Admin');
    }
  }
  
  // Update allowed fields
  const allowedUpdates = [
    'title', 
    'description', 
    'priority', 
    'status', 
    'dueDate', 
    'progress', 
    'subTasks', 
    'notes',
    'assignedTo'  // Only HR/Admin can reassign
  ];
  
  Object.keys(updateData).forEach(key => {
    if (allowedUpdates.includes(key)) {
      // Only HR/Admin can reassign tasks
      if (key === 'assignedTo' && userRole === ROLES.EMPLOYEE) {
        return;
      }
      task[key] = updateData[key];
    }
  });
  
  // Auto-complete if progress reaches 100%
  if (updateData.progress === 100 && task.status !== TASK_STATUS.COMPLETED) {
    task.status = TASK_STATUS.COMPLETED;
    task.completedAt = new Date();
  }
  
  await task.save();
  await task.populate([
    { path: 'assignedTo', select: 'name employeeId department position' },
    { path: 'assignedBy', select: 'name employeeId' }
  ]);
  
  return task;
};

/**
 * Update task progress
 */
const updateTaskProgress = async (taskId, progress, userId, userRole) => {
  const task = await Task.findById(taskId);
  
  if (!task) {
    throw new Error(ERROR_MESSAGES.TASK_NOT_FOUND);
  }
  
  // Check if user is assigned to this task or has permission
  if (task.assignedTo.toString() !== userId.toString() && 
      userRole === ROLES.EMPLOYEE) {
    throw new Error('You can only update progress on tasks assigned to you');
  }
  
  task.progress = Math.min(100, Math.max(0, progress)); // Clamp between 0-100
  
  // Auto-complete if progress reaches 100%
  if (task.progress === 100 && task.status !== TASK_STATUS.COMPLETED) {
    task.status = TASK_STATUS.COMPLETED;
    task.completedAt = new Date();
  }
  
  // If progress drops below 100, revert from completed
  if (task.progress < 100 && task.status === TASK_STATUS.COMPLETED) {
    task.status = TASK_STATUS.IN_PROGRESS;
    task.completedAt = null;
  }
  
  await task.save();
  return task;
};

/**
 * Delete task
 */
const deleteTask = async (taskId, userId, userRole) => {
  const task = await Task.findById(taskId);
  
  if (!task) {
    throw new Error(ERROR_MESSAGES.TASK_NOT_FOUND);
  }
  
  // Check delete permissions
  if (!canDeleteTask(task, userId, userRole)) {
    throw new Error(ERROR_MESSAGES.CANNOT_DELETE_HR_TASK);
  }
  
  await Task.findByIdAndDelete(taskId);
  return task;
};

/**
 * Get tasks with filters
 */
const getTasks = async (companyId, filters = {}) => {
  const query = { company: companyId };
  
  // Assigned to filter
  if (filters.assignedTo) {
    query.assignedTo = filters.assignedTo;
  }
  
  // Assigned by filter
  if (filters.assignedBy) {
    query.assignedBy = filters.assignedBy;
  }
  
  // Status filter
  if (filters.status) {
    query.status = filters.status;
  }
  
  // Priority filter
  if (filters.priority) {
    query.priority = filters.priority;
  }
  
  // Due date filter
  if (filters.dueBefore) {
    query.dueDate = { $lte: new Date(filters.dueBefore) };
  }
  
  if (filters.dueAfter) {
    query.dueDate = { ...query.dueDate, $gte: new Date(filters.dueAfter) };
  }
  
  // Search by title
  if (filters.search) {
    query.title = { $regex: filters.search, $options: 'i' };
  }
  
  const tasks = await Task.find(query)
    .sort({ createdAt: -1 })
    .populate('assignedTo', 'name employeeId department position profilePhoto')
    .populate('assignedBy', 'name employeeId')
    .populate('attachments.uploadedBy', 'name employeeId');
  
  return tasks;
};

/**
 * Get single task by ID
 */
const getTaskById = async (taskId, userId, userRole, companyId) => {
  const task = await Task.findById(taskId)
    .populate('assignedTo', 'name employeeId department position profilePhoto')
    .populate('assignedBy', 'name employeeId')
    .populate('attachments.uploadedBy', 'name employeeId');
  
  if (!task) {
    throw new Error(ERROR_MESSAGES.TASK_NOT_FOUND);
  }
  
  // Verify company access
  if (task.company.toString() !== companyId.toString()) {
    throw new Error(ERROR_MESSAGES.COMPANY_ACCESS_DENIED);
  }
  
  return task;
};

/**
 * Add attachment to task
 */
const addTaskAttachment = async (taskId, attachmentData, userId, userRole) => {
  const task = await Task.findById(taskId);
  
  if (!task) {
    throw new Error(ERROR_MESSAGES.TASK_NOT_FOUND);
  }
  
  // Check permissions
  if (!canModifyTask(task, userId, userRole)) {
    throw new Error(ERROR_MESSAGES.FORBIDDEN);
  }
  
  task.attachments.push({
    ...attachmentData,
    uploadedBy: userId,
    uploadedAt: new Date()
  });
  
  await task.save();
  return task;
};

/**
 * Update subtask completion status
 */
const updateSubTask = async (taskId, subTaskId, completed, userId, userRole) => {
  const task = await Task.findById(taskId);
  
  if (!task) {
    throw new Error(ERROR_MESSAGES.TASK_NOT_FOUND);
  }
  
  // Check permissions
  if (task.assignedTo.toString() !== userId.toString() && 
      userRole === ROLES.EMPLOYEE) {
    throw new Error('You can only update subtasks on tasks assigned to you');
  }
  
  const subTask = task.subTasks.id(subTaskId);
  if (!subTask) {
    throw new Error('Subtask not found');
  }
  
  subTask.completed = completed;
  
  // Auto-calculate progress based on subtasks
  if (task.subTasks.length > 0) {
    const completedSubTasks = task.subTasks.filter(st => st.completed).length;
    task.progress = Math.round((completedSubTasks / task.subTasks.length) * 100);
  }
  
  await task.save();
  return task;
};

/**
 * Get task statistics
 */
const getTaskStatistics = async (companyId, userId, userRole) => {
  const query = { company: companyId };
  
  // If employee, only show their tasks
  if (userRole === ROLES.EMPLOYEE) {
    query.$or = [
      { assignedTo: userId },
      { assignedBy: userId }
    ];
  }
  
  const tasks = await Task.find(query);
  
  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === TASK_STATUS.TODO).length,
    inProgress: tasks.filter(t => t.status === TASK_STATUS.IN_PROGRESS).length,
    completed: tasks.filter(t => t.status === TASK_STATUS.COMPLETED).length,
    cancelled: tasks.filter(t => t.status === TASK_STATUS.CANCELLED).length,
    highPriority: tasks.filter(t => t.priority === TASK_PRIORITY.HIGH).length,
    overdue: tasks.filter(t => 
      t.dueDate && 
      new Date(t.dueDate) < new Date() && 
      t.status !== TASK_STATUS.COMPLETED
    ).length,
    averageProgress: tasks.length > 0 
      ? Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length)
      : 0
  };
  
  return stats;
};

module.exports = {
  createTask,
  updateTask,
  updateTaskProgress,
  deleteTask,
  getTasks,
  getTaskById,
  addTaskAttachment,
  updateSubTask,
  getTaskStatistics,
  canModifyTask,
  canDeleteTask
};

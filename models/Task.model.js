const mongoose = require('mongoose');

const subTaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  completed: {
    type: Boolean,
    default: false
  }
});

const attachmentSchema = new mongoose.Schema({
  name: String,
  type: {
    type: String,
    enum: ['image', 'video', 'document', 'api']
  },
  url: String,
  publicId: String,
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true
  },
  description: String,
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true // CRITICAL: Enforce company association
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['todo', 'in-progress', 'completed', 'cancelled'], // Added 'cancelled'
    default: 'todo'
  },
  dueDate: Date,
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  subTasks: [subTaskSchema],
  attachments: [attachmentSchema],
  notes: String,
  createdBy: {
    type: String,
    enum: ['admin', 'hr', 'employee'],
    required: true
  },
  completedAt: Date,
  // CRITICAL: Track if employee can delete/modify
  isDeletableByEmployee: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// CRITICAL: Index for company-level queries (data isolation)
taskSchema.index({ company: 1, status: 1 });
taskSchema.index({ assignedTo: 1, status: 1 });

// CRITICAL: Auto-complete task when progress = 100%
taskSchema.pre('save', function(next) {
  if (this.progress === 100 && this.status !== 'completed') {
    this.status = 'completed';
    this.completedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Task', taskSchema);

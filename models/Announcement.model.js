const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false // Optional: Allow announcements without company (for admin)
  },
  targetDepartment: String, // If set, only visible to this department
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  attachments: [{
    url: String,
    publicId: String,
    name: String
  }],
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  expiryDate: Date,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// PERFORMANCE: Indexes for efficient queries
announcementSchema.index({ company: 1, createdAt: -1 });
announcementSchema.index({ company: 1, priority: -1 });
announcementSchema.index({ company: 1, targetDepartment: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);

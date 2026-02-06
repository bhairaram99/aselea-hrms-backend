const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false // Made optional for testing/flexibility
  },
  leaveType: {
    type: String,
    enum: ['sick', 'casual', 'annual', 'maternity', 'paternity', 'unpaid'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  days: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'], // Added 'cancelled'
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNote: String,
  attachments: [{
    url: String,
    publicId: String
  }],
  // CRITICAL: Track balance changes
  balanceDeducted: {
    type: Number,
    default: 0
  },
  balanceRestored: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// CRITICAL: Compound index to prevent overlapping leaves
leaveSchema.index({ user: 1, startDate: 1, endDate: 1 });

// CRITICAL: Index for company-level queries (data isolation)
leaveSchema.index({ company: 1, status: 1 });

module.exports = mongoose.model('Leave', leaveSchema);

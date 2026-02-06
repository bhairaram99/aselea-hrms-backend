const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false // Optional: Allow expenses without company
  },
  category: {
    type: String,
    required: true,
    enum: ['travel', 'food', 'office-supplies', 'software', 'training', 'other']
  },
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount must be positive']
  },
  currency: {
    type: String,
    default: 'USD'
  },
  date: {
    type: Date,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  receipt: {
    url: String,
    publicId: String
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected', 'paid'], // Added 'draft' and 'paid'
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNote: String,
  // CRITICAL: Lock edits after approval/rejection
  isLocked: {
    type: Boolean,
    default: false
  },
  // Track payment
  paidAt: Date,
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// CRITICAL: Index for company-level queries (data isolation)
expenseSchema.index({ company: 1, status: 1 });
expenseSchema.index({ user: 1, status: 1 });

// CRITICAL: Auto-lock expense after approval/rejection
expenseSchema.pre('save', function(next) {
  if (this.status === 'approved' || this.status === 'rejected') {
    this.isLocked = true;
  }
  next();
});

module.exports = mongoose.model('Expense', expenseSchema);

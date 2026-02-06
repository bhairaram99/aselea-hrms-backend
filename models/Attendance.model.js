const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false // Made optional to support employees without company assignment
  },
  date: {
    type: Date,
    required: true
  },
  checkIn: {
    time: Date,
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    },
    // Photo captured at check-in (Cloudinary URL)
    photo: {
      url: String,
      publicId: String,
      capturedAt: Date
    }
  },
  checkOut: {
    time: Date,
    location: {
      latitude: Number,
      longitude: Number,
      address: String
    }
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late', 'half-day', 'work-from-home'],
    default: 'present'
  },
  workHours: {
    type: Number,
    default: 0 // CRITICAL: Auto-calculated field
  },
  notes: String,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // CRITICAL: Track if manually marked by HR/Admin
  isManualEntry: {
    type: Boolean,
    default: false
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// AttendanceEditRequest Schema - For employee edit requests
const attendanceEditRequestSchema = new mongoose.Schema({
  attendance: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Attendance',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company'
  },
  date: {
    type: Date,
    required: true
  },
  // Original values
  originalCheckIn: Date,
  originalCheckOut: Date,
  // Requested values
  requestedCheckIn: {
    type: Date,
    required: true
  },
  requestedCheckOut: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    required: true,
    minlength: 10
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  reviewNote: String
}, {
  timestamps: true
});

// CRITICAL: Unique constraint - one attendance per user per day
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

// CRITICAL: Index for company-level queries (data isolation)
attendanceSchema.index({ company: 1, date: 1 });

// Index for edit requests
attendanceEditRequestSchema.index({ company: 1, status: 1 });
attendanceEditRequestSchema.index({ user: 1, status: 1 });

// CRITICAL: Auto-calculate work hours before save
attendanceSchema.pre('save', function(next) {
  if (this.checkIn?.time && this.checkOut?.time) {
    const diffMs = this.checkOut.time - this.checkIn.time;
    this.workHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100; // Hours with 2 decimals
  }
  next();
});

const Attendance = mongoose.model('Attendance', attendanceSchema);
const AttendanceEditRequest = mongoose.model('AttendanceEditRequest', attendanceEditRequestSchema);

module.exports = { Attendance, AttendanceEditRequest };

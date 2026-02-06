const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true
  },
  phone: String,
  address: String,
  website: String,
  logo: {
    url: String,
    publicId: String
  },
  industry: String,
  size: {
    type: String,
    enum: ['1-10', '11-50', '51-200', '201-500', '500+']
  },
  hrManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'premium', 'enterprise'],
      default: 'free'
    },
    startDate: Date,
    endDate: Date,
    employeeLimit: Number
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// PERFORMANCE: Indexes for efficient queries
companySchema.index({ email: 1 }, { unique: true });
companySchema.index({ status: 1 });
companySchema.index({ industry: 1 });

module.exports = mongoose.model('Company', companySchema);

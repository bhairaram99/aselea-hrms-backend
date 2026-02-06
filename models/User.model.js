const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const loginHistorySchema = new mongoose.Schema({
  loginTime: {
    type: Date,
    default: Date.now
  },
  logoutTime: Date,
  location: {
    latitude: Number,
    longitude: Number,
    address: String,
    city: String,
    country: String,
    ipAddress: String
  },
  device: {
    userAgent: String,
    browser: String,
    os: String
  }
});

const userSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    required: [true, 'Employee ID is required'],
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  phone: {
    type: String,
    required: true
  },
  dateOfBirth: Date,
  address: String,
  profilePhoto: {
    url: String,
    publicId: String
  },
  role: {
    type: String,
    enum: ['admin', 'hr', 'employee'],
    default: 'employee'
  },
  department: {
    type: String,
    required: function() { return this.role === 'employee'; }
  },
  position: String,
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: false  // Made optional for single-company mode
  },
  reportingTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  joinDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['active', 'on-leave', 'inactive'],
    default: 'active'
  },
  currentLocation: {
    latitude: Number,
    longitude: Number,
    address: String,
    lastUpdated: Date
  },
  // CRITICAL: Leave balance tracking for employees
  leaveBalance: {
    annual: { type: Number, default: 21 },    // 21 days annual leave
    sick: { type: Number, default: 14 },      // 14 days sick leave
    casual: { type: Number, default: 7 },     // 7 days casual leave
    maternity: { type: Number, default: 90 }, // 90 days maternity (for female employees)
    paternity: { type: Number, default: 7 },  // 7 days paternity (for male employees)
    unpaid: { type: Number, default: 0 }      // Unpaid leave (unlimited)
  },
  loginHistory: [loginHistorySchema],
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate JWT Token
userSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// Add login history with location
userSchema.methods.addLoginHistory = function(locationData, deviceData) {
  this.loginHistory.push({
    loginTime: new Date(),
    location: locationData,
    device: deviceData
  });
  
  // Update current location
  if (locationData.latitude && locationData.longitude) {
    this.currentLocation = {
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      address: locationData.address,
      lastUpdated: new Date()
    };
  }
  
  return this.save();
};

// PERFORMANCE: Indexes for efficient queries
userSchema.index({ employeeId: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ company: 1, role: 1 }); // Company isolation + role filtering
userSchema.index({ company: 1, department: 1 }); // Department queries
userSchema.index({ company: 1, status: 1 }); // Status filtering
userSchema.index({ role: 1, status: 1 }); // Admin queries

module.exports = mongoose.model('User', userSchema);

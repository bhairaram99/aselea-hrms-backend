/**
 * SETUP ROUTES - Initial system setup
 * 
 * These routes are ONLY for first-time setup
 * They are disabled after the first admin is created
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User.model');
const generateToken = require('../utils/generateToken');

const router = express.Router();

/**
 * @desc    Create first admin user (only works if no users exist)
 * @route   POST /api/setup/first-admin
 * @access  Public (but only works once!)
 */
router.post('/first-admin', async (req, res) => {
  try {
    // Check if any users exist
    const userCount = await User.countDocuments();
    
    if (userCount > 0) {
      return res.status(403).json({
        success: false,
        message: 'Setup already completed. Admin user already exists. Please use /api/auth/login'
      });
    }

    const { employeeId, name, email, password } = req.body;

    // Validation
    if (!employeeId || !name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide employeeId, name, email, and password'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create admin
    const admin = await User.create({
      employeeId,
      name,
      email,
      password: hashedPassword,
      role: 'admin',
      department: req.body.department || 'Administration',
      position: req.body.position || 'System Administrator',
      status: 'active',
      company: null
    });

    // Generate token
    const token = generateToken(admin._id);

    res.status(201).json({
      success: true,
      message: 'First admin created successfully! Setup complete.',
      token,
      user: {
        _id: admin._id,
        employeeId: admin.employeeId,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        department: admin.department,
        position: admin.position
      }
    });
  } catch (error) {
    console.error('Setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating admin',
      error: error.message
    });
  }
});

/**
 * @desc    Check if setup is needed
 * @route   GET /api/setup/status
 * @access  Public
 */
router.get('/status', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    
    res.status(200).json({
      success: true,
      setupNeeded: userCount === 0,
      userCount,
      message: userCount === 0 
        ? 'Setup needed. Please create first admin at POST /api/setup/first-admin'
        : 'Setup complete. Use POST /api/auth/login to login'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking setup status',
      error: error.message
    });
  }
});

module.exports = router;

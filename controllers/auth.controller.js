const User = require('../models/User.model');
const axios = require('axios');
const geoip = require('geoip-lite');
const { uploadToCloudinary } = require('../utils/uploadToCloudinary');

// Helper function to get location from IP
const getLocationFromIP = (ip) => {
  const geo = geoip.lookup(ip);
  if (geo) {
    return {
      latitude: geo.ll[0],
      longitude: geo.ll[1],
      city: geo.city,
      country: geo.country,
      ipAddress: ip
    };
  }
  return { ipAddress: ip };
};

// Helper function to reverse geocode (lat/lng to address)
const reverseGeocode = async (latitude, longitude) => {
  try {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return `${latitude}, ${longitude}`;
    }

    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${process.env.GOOGLE_MAPS_API_KEY}`
    );
    
    if (response.data.results && response.data.results[0]) {
      const result = response.data.results[0];
      const addressComponents = result.address_components;
      
      let city = '';
      let country = '';
      
      addressComponents.forEach(component => {
        if (component.types.includes('locality')) {
          city = component.long_name;
        }
        if (component.types.includes('country')) {
          country = component.long_name;
        }
      });
      
      return {
        address: result.formatted_address,
        city: city || 'Unknown',
        country: country || 'Unknown'
      };
    }
  } catch (error) {
    console.error('Geocoding error:', error.message);
  }
  return {
    address: `${latitude}, ${longitude}`,
    city: 'Unknown',
    country: 'Unknown'
  };
};

// @desc    Login user with location tracking
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { employeeId, email, password, location } = req.body;

    console.log('🔐 Login attempt:', { email, employeeId, hasPassword: !!password });

    // Validate input - accept either email or employeeId
    if ((!employeeId && !email) || !password) {
      console.log('❌ Validation failed: missing credentials');
      return res.status(400).json({
        success: false,
        message: 'Please provide email/employee ID and password'
      });
    }

    // Find user by email or employeeId (include password for verification)
    const user = await User.findOne({ 
      $or: [
        { email: email },
        { employeeId: employeeId }
      ]
    }).select('+password');

    console.log('👤 User found:', !!user, user?.email, user?.role);

    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordMatch = await user.matchPassword(password);
    console.log('🔑 Password match:', isPasswordMatch);

    if (!isPasswordMatch) {
      console.log('❌ Password mismatch');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (user.status === 'inactive') {
      console.log('❌ User inactive');
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact HR.'
      });
    }

    // Prepare location data
    let locationData = {};
    
    // Get IP address
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress;
    const cleanIP = ip.replace('::ffff:', '');
    
    if (location && location.latitude && location.longitude) {
      // Use GPS location from frontend
      const geoData = await reverseGeocode(location.latitude, location.longitude);
      locationData = {
        latitude: location.latitude,
        longitude: location.longitude,
        address: geoData.address,
        city: geoData.city,
        country: geoData.country,
        ipAddress: cleanIP
      };
    } else {
      // Fallback to IP-based location
      locationData = getLocationFromIP(cleanIP);
      if (!locationData.address) {
        locationData.address = 'Location not available';
      }
    }

    // Prepare device data
    const deviceData = {
      userAgent: req.headers['user-agent'] || 'Unknown',
      browser: req.headers['user-agent']?.split(' ').pop() || 'Unknown',
      os: req.headers['user-agent']?.split('(')[1]?.split(')')[0] || 'Unknown'
    };

    // Add login history with location
    await user.addLoginHistory(locationData, deviceData);

    // Generate token
    const token = user.getSignedJwtToken();

    // Remove password from response
    user.password = undefined;

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        employeeId: user.employeeId,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        position: user.position,
        profilePhoto: user.profilePhoto,
        currentLocation: user.currentLocation
      },
      loginLocation: locationData
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
};

// @desc    Register new user (Admin/HR only)
// @route   POST /api/auth/register
// @access  Private (Admin/HR)
exports.register = async (req, res, next) => {
  try {
    const {
      employeeId,
      name,
      email,
      password,
      phone,
      dateOfBirth,
      address,
      role,
      department,
      position,
      company,
      reportingTo
    } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ email }, { employeeId }] });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or employee ID already exists'
      });
    }

    // Determine company: use provided company or inherit from logged-in user (Admin/HR)
    let assignedCompany = company;
    if (!assignedCompany && req.user && req.user.company) {
      assignedCompany = req.user.company;
    }

    // Handle profile photo upload
    let profilePhoto = null;
    if (req.file) {
      try {
        console.log('📸 Uploading profile photo to Cloudinary...');
        const uploadResult = await uploadToCloudinary(req.file.buffer, { folder: 'profile-photos' });
        profilePhoto = {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id
        };
        console.log('✅ Profile photo uploaded:', profilePhoto.url);
      } catch (uploadError) {
        console.error('❌ Profile photo upload error:', uploadError);
        // Continue without photo if upload fails
      }
    } else {
      console.log('📷 No profile photo file received in request');
    }

    // Create user
    const user = await User.create({
      employeeId,
      name,
      email,
      password,
      phone,
      dateOfBirth,
      address,
      role: role || 'employee',
      department,
      position,
      company: assignedCompany,
      reportingTo,
      profilePhoto
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user._id,
        employeeId: user.employeeId,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePhoto: user.profilePhoto
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('company', 'name logo')
      .populate('reportingTo', 'name email position');

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Get login history
// @route   GET /api/auth/login-history/:userId
// @access  Private
exports.getLoginHistory = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('loginHistory');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      loginHistory: user.loginHistory.sort((a, b) => b.loginTime - a.loginTime)
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Update current location
// @route   PUT /api/auth/update-location
// @access  Private
exports.updateLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const geoData = await reverseGeocode(latitude, longitude);
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        currentLocation: {
          latitude,
          longitude,
          address: geoData.address,
          lastUpdated: new Date()
        }
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      currentLocation: user.currentLocation
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating location',
      error: error.message
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    // Update the last login history entry with logout time
    const user = await User.findById(req.user.id);
    
    if (user && user.loginHistory.length > 0) {
      user.loginHistory[user.loginHistory.length - 1].logoutTime = new Date();
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error during logout',
      error: error.message
    });
  }
};

/**
 * @desc    Request password reset (no auth required)
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email address'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if user exists (security)
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token (6-digit code)
    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    const resetTokenExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Save to user (you'll need to add these fields to User model)
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = resetTokenExpire;
    await user.save();

    // TODO: Send email with reset token
    // For now, return token (ONLY FOR DEVELOPMENT!)
    // In production, send via email
    const sendEmail = require('../utils/emailService');
    
    try {
      await sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        text: `Your password reset code is: ${resetToken}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this, please ignore this email.`
      });

      res.status(200).json({
        success: true,
        message: 'Password reset code sent to your email'
      });
    } catch (emailError) {
      // If email fails, still return success but log error
      console.error('Email send error:', emailError);
      
      // FOR DEVELOPMENT ONLY - Remove in production!
      if (process.env.NODE_ENV === 'development') {
        return res.status(200).json({
          success: true,
          message: 'Email service not configured. Reset code: ' + resetToken,
          resetToken // REMOVE THIS IN PRODUCTION!
        });
      }

      res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing password reset request',
      error: error.message
    });
  }
};

/**
 * @desc    Reset password with token
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
exports.resetPassword = async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;

    if (!email || !resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, reset token, and new password'
      });
    }

    // Find user with valid reset token
    const user = await User.findOne({
      email,
      resetPasswordToken: resetToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Update password
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Clear reset token
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    // Generate new JWT token
    const token = user.getSignedJwtToken();

    res.status(200).json({
      success: true,
      message: 'Password reset successful',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error resetting password',
      error: error.message
    });
  }
};

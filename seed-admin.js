/**
 * SEED SCRIPT - Create First Admin User
 * 
 * Run this ONCE to create the first admin account
 * After that, use the normal registration flow
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import User model
const User = require('./models/User.model');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    createAdmin();
  })
  .catch((err) => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
  });

const createAdmin = async () => {
  try {
    // Check if admin already exists
    const existingAdmin = await User.findOne({ employeeId: 'ADMIN-001' });
    
    if (existingAdmin) {
      console.log('⚠️  Admin already exists!');
      console.log('   Employee ID:', existingAdmin.employeeId);
      console.log('   Email:', existingAdmin.email);
      console.log('   Name:', existingAdmin.name);
      process.exit(0);
    }

    // Create admin user with plain password (let pre-save hook hash it)
    const admin = new User({
      employeeId: 'ADMIN-001',
      name: 'Super Admin',
      email: 'admin@company.com',
      phone: '+1234567890',
      password: 'admin123', // Plain password - will be hashed by pre-save hook
      role: 'admin',
      department: 'Administration',
      position: 'System Administrator',
      status: 'active',
      company: null // Admin manages all companies
    });

    // Save normally - let the pre-save hook hash the password
    await admin.save();

    console.log('✅ Admin created successfully!');
    console.log('');
    console.log('📋 Admin Credentials:');
    console.log('   Employee ID: ADMIN-001');
    console.log('   Email: admin@company.com');
    console.log('   Password: admin123');
    console.log('');
    console.log('⚠️  Please change the password after first login!');
    console.log('');
    console.log('🚀 You can now login at: POST /api/auth/login');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
};

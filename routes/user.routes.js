const express = require('express');
const { protect, authorize } = require('../middleware/auth.middleware');
const userController = require('../controllers/userController');

const router = express.Router();

// Get all users (admin/hr only)
router.get('/', protect, authorize('admin', 'hr'), userController.getAllUsers);

// Get user by ID (with permission checks in controller)
router.get('/:id', protect, userController.getUserById);

// Update user (with permission checks in controller)
router.put('/:id', protect, userController.updateUser);

// Delete user (admin/hr only, with additional checks in controller)
router.delete('/:id', protect, authorize('admin', 'hr'), userController.deleteUser);

module.exports = router;

/**
 * ANNOUNCEMENT CONTROLLER - Handles company announcements
 * 
 * Manages announcements for company-wide or department-specific communications
 */

const Announcement = require('../models/Announcement.model');

/**
 * @desc    Get all announcements
 * @route   GET /api/announcements
 * @access  Private
 */
exports.getAnnouncements = async (req, res) => {
  try {
    const { priority, department } = req.query;
    const companyId = req.user.company;

    // Build filter - include global announcements (no company) and company-specific ones
    const filter = {};
    
    if (companyId) {
      filter.$or = [
        { company: companyId },
        { company: { $exists: false } },
        { company: null }
      ];
    }

    if (priority) filter.priority = priority;
    
    // Filter by department or global announcements
    if (department) {
      filter.$or = [
        { targetDepartment: department },
        { targetDepartment: { $exists: false } }
      ];
    }

    const announcements = await Announcement.find(filter)
      .populate('createdBy', 'name email')
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: announcements.length,
      data: announcements
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch announcements',
      error: error.message
    });
  }
};

/**
 * @desc    Get announcement by ID
 * @route   GET /api/announcements/:id
 * @access  Private
 */
exports.getAnnouncementById = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id)
      .populate('createdBy', 'name email position')
      .lean();

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    res.status(200).json({
      success: true,
      data: announcement
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch announcement',
      error: error.message
    });
  }
};

/**
 * @desc    Create announcement
 * @route   POST /api/announcements
 * @access  Private (HR, Admin)
 */
exports.createAnnouncement = async (req, res) => {
  try {
    const companyId = req.user.company;
    const { title, content, priority, category, targetDepartment, expiryDate } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title and content are required'
      });
    }

    // Create announcement with optional company
    const announcementData = {
      title,
      content,
      priority: priority || 'medium',
      createdBy: req.user._id,
      company: companyId || null,
      isActive: true
    };

    // Add optional fields
    if (targetDepartment) announcementData.targetDepartment = targetDepartment;
    if (expiryDate) announcementData.expiryDate = expiryDate;
    if (category) announcementData.category = category;

    const announcement = await Announcement.create(announcementData);

    await announcement.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: announcement
    });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create announcement',
      error: error.message
    });
  }
};

/**
 * @desc    Update announcement
 * @route   PUT /api/announcements/:id
 * @access  Private (HR, Admin)
 */
exports.updateAnnouncement = async (req, res) => {
  try {
    const companyId = req.user.company;

    // Don't allow changing company or creator
    delete req.body.company;
    delete req.body.createdBy;

    const announcement = await Announcement.findOneAndUpdate(
      {
        _id: req.params.id,
        company: req.user.role === 'admin' ? req.body.company || companyId : companyId
      },
      req.body,
      { new: true, runValidators: true }
    );

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Announcement updated successfully',
      data: announcement
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update announcement',
      error: error.message
    });
  }
};

/**
 * @desc    Delete announcement
 * @route   DELETE /api/announcements/:id
 * @access  Private (HR, Admin)
 */
exports.deleteAnnouncement = async (req, res) => {
  try {
    const companyId = req.user.company;

    const announcement = await Announcement.findOneAndDelete({
      _id: req.params.id,
      company: req.user.role === 'admin' ? undefined : companyId
    });

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete announcement',
      error: error.message
    });
  }
};

/**
 * @desc    Mark announcement as read
 * @route   PUT /api/announcements/:id/read
 * @access  Private
 */
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    // Add user to readBy array if not already there
    if (!announcement.readBy.includes(userId)) {
      announcement.readBy.push(userId);
      await announcement.save();
    }

    res.status(200).json({
      success: true,
      message: 'Announcement marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to mark announcement as read',
      error: error.message
    });
  }
};

/**
 * @desc    Get unread announcements count
 * @route   GET /api/announcements/unread/count
 * @access  Private
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const companyId = req.user.company;

    const count = await Announcement.countDocuments({
      company: companyId,
      readBy: { $ne: userId }
    });

    res.status(200).json({
      success: true,
      count
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count',
      error: error.message
    });
  }
};

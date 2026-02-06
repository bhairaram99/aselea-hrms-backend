const express = require('express');
const { protect, authorize } = require('../middleware/auth.middleware');
const announcementController = require('../controllers/announcementController');

const router = express.Router();

// All routes require authentication
router.use(protect);

// All users can view announcements
router.get('/', announcementController.getAnnouncements);
router.get('/unread/count', announcementController.getUnreadCount);
router.get('/:id', announcementController.getAnnouncementById);
router.put('/:id/read', announcementController.markAsRead);

// HR and Admin can manage announcements
router.post('/', authorize('admin', 'hr'), announcementController.createAnnouncement);
router.put('/:id', authorize('admin', 'hr'), announcementController.updateAnnouncement);
router.delete('/:id', authorize('admin', 'hr'), announcementController.deleteAnnouncement);

module.exports = router;

const express = require('express');
const { protect } = require('../middleware/auth.middleware');
const upload = require('../middleware/uploadMiddleware');
const chatController = require('../controllers/chatController');

const router = express.Router();

// All routes require authentication
router.use(protect);

// ============================================
// CHAT ROOMS
// ============================================

// Get all chat rooms (personal + groups)
router.get('/rooms', chatController.getChatRooms);

// Get or create personal chat with a user
router.post('/rooms/personal', chatController.getOrCreatePersonalChat);

// Get messages in a chat room
router.get('/rooms/:roomId/messages', chatController.getRoomMessages);

// Send message to a chat room
router.post('/rooms/:roomId/messages', chatController.sendRoomMessage);

// Upload media to a chat room
router.post('/rooms/:roomId/upload', upload.single('file'), chatController.uploadMedia);

// Mark room messages as read
router.put('/rooms/:roomId/read', chatController.markRoomAsRead);

// ============================================
// GROUPS
// ============================================

// Create a group
router.post('/groups', chatController.createGroup);

// Get group details
router.get('/groups/:groupId', chatController.getGroupDetails);

// Update group
router.put('/groups/:groupId', chatController.updateGroup);

// Delete group
router.delete('/groups/:groupId', chatController.deleteGroup);

// Add members to group
router.post('/groups/:groupId/members', chatController.addGroupMembers);

// Remove member from group
router.delete('/groups/:groupId/members/:memberId', chatController.removeGroupMember);

// Leave group
router.post('/groups/:groupId/leave', chatController.leaveGroup);

// Get group messages (legacy route)
router.get('/groups/:groupId/messages', chatController.getGroupMessages);

// ============================================
// USERS
// ============================================

// Get all company users for chat
router.get('/users', chatController.getCompanyUsers);

// Search users
router.get('/users/search', chatController.searchUsers);

// ============================================
// MESSAGES
// ============================================

// Delete a message
router.delete('/messages/:messageId', chatController.deleteMessage);

// Get unread count
router.get('/unread', chatController.getUnreadCount);

// ============================================
// LEGACY ROUTES (backward compatibility)
// ============================================

// Get conversations (legacy)
router.get('/conversations', chatController.getConversations);

// Get messages with user (legacy)
router.get('/messages/:userId', chatController.getMessages);

// Send message (legacy)
router.post('/send', chatController.sendMessage);

// Mark as read (legacy)
router.put('/read/:userId', chatController.markAsRead);

// Legacy unread count
router.get('/unread/count', chatController.getUnreadCount);

module.exports = router;

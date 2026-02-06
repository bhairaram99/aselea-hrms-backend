/**
 * CHAT CONTROLLER - Complete Chat System with Group Support
 * 
 * Features:
 * - Personal (1-1) chat
 * - Group chat with admin controls
 * - Media sharing (image, document, voice)
 * - Company-based isolation
 * - Real-time Socket.io integration
 */

const Message = require('../models/Message.model');
const ChatRoom = require('../models/ChatRoom.model');
const User = require('../models/User.model');
const Company = require('../models/Company.model');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/uploadToCloudinary');

// Helper function to get a default company when needed
const getDefaultCompany = async () => {
  try {
    // Try to find "Aselea Network" company first
    let company = await Company.findOne({ name: /aselea/i }).select('_id name').lean();
    console.log('🔍 Looking for default company (Aselea):', company);
    
    if (!company) {
      // Otherwise get the first active company
      company = await Company.findOne({ status: 'active' }).select('_id name').lean();
      console.log('🔍 Looking for first active company:', company);
    }
    
    if (!company) {
      // Get any company
      company = await Company.findOne({}).select('_id name').lean();
      console.log('🔍 Looking for any company:', company);
    }
    
    if (!company) {
      console.log('⚠️ No company found in database - creating default Aselea Network company');
      // Create default company if none exists
      company = await Company.create({
        name: 'Aselea Network',
        email: 'contact@aselea.com',
        status: 'active',
        subscription: {
          plan: 'enterprise',
          employeeLimit: 1000
        }
      });
      console.log('✅ Created default company:', company);
    }
    
    return company._id;
  } catch (error) {
    console.error('❌ Error in getDefaultCompany:', error);
    return null;
  }
};

// ============================================
// CHAT ROOMS / CONVERSATIONS
// ============================================

/**
 * @desc    Get all chat rooms (conversations) for user
 * @route   GET /api/chat/rooms
 * @access  Private
 */
exports.getChatRooms = async (req, res) => {
  try {
    const userId = req.user._id;
    const companyId = req.user.company;
    const isAdmin = req.user.role === 'admin';

    // Build query - admin can see all their chats, others only in their company
    const query = {
      participants: userId,
      isActive: true
    };
    
    // Only filter by company if user has one (admin may not)
    if (companyId) {
      query.company = companyId;
    }

    const rooms = await ChatRoom.find(query)
      .populate('participants', 'name email profilePhoto position status')
      .populate('admins', 'name')
      .populate('lastMessage.sender', 'name')
      .sort({ 'lastMessage.createdAt': -1, updatedAt: -1 })
      .lean();

    // Calculate unread counts for each room
    const roomsWithUnread = await Promise.all(rooms.map(async (room) => {
      const unreadCount = await Message.countDocuments({
        chatRoom: room._id,
        sender: { $ne: userId },
        isRead: false,
        isDeleted: false
      });

      // For personal chats, get the other user
      let otherUser = null;
      if (room.type === 'personal') {
        otherUser = room.participants.find(p => p._id.toString() !== userId.toString());
      }

      return {
        ...room,
        unreadCount,
        otherUser
      };
    }));

    res.status(200).json({
      success: true,
      count: roomsWithUnread.length,
      data: roomsWithUnread
    });
  } catch (error) {
    console.error('getChatRooms error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat rooms',
      error: error.message
    });
  }
};

/**
 * @desc    Get or create personal chat room with a user
 * @route   POST /api/chat/rooms/personal
 * @access  Private
 */
exports.getOrCreatePersonalChat = async (req, res) => {
  try {
    const { userId } = req.body;
    const currentUserId = req.user._id;
    const companyId = req.user.company;

    console.log('💬 getOrCreatePersonalChat called:');
    console.log('   Current user:', req.user.name, '| ID:', currentUserId, '| Company:', companyId);
    console.log('   Target user ID:', userId);

    if (!userId) {
      console.log('❌ No userId provided');
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    if (userId === currentUserId.toString()) {
      console.log('❌ User trying to chat with themselves');
      return res.status(400).json({
        success: false,
        message: 'Cannot create chat with yourself'
      });
    }

    // Verify target user exists
    const targetUser = await User.findById(userId).select('company name role').lean();
    
    if (!targetUser) {
      console.log('❌ Target user not found');
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('   Target user:', targetUser.name, '| Role:', targetUser.role, '| Company:', targetUser.company);

    // Admin can chat with anyone, HR/employees can chat with anyone in their company or admins
    const isAdmin = req.user.role === 'admin';
    const isTargetAdmin = targetUser.company === null;
    const targetCompanyId = targetUser.company ? targetUser.company.toString() : null;
    const userCompanyId = companyId ? companyId.toString() : null;
    
    console.log('   isAdmin:', isAdmin, '| isTargetAdmin:', isTargetAdmin);
    console.log('   userCompanyId:', userCompanyId, '| targetCompanyId:', targetCompanyId);
    
    // Allow chat if: either user is admin OR both have same company
    if (!isAdmin && !isTargetAdmin && targetCompanyId && userCompanyId && targetCompanyId !== userCompanyId) {
      console.log('❌ Users from different companies');
      return res.status(403).json({
        success: false,
        message: 'Cannot chat with users outside your company'
      });
    }

    // Use either user's company for the chat room, or get default company
    let chatCompanyId = companyId || targetUser.company;
    
    console.log('   Initial chatCompanyId:', chatCompanyId);
    
    if (!chatCompanyId) {
      console.log('   ⚙️ No company found, getting default company...');
      // Get default company (Aselea Network or first available)
      chatCompanyId = await getDefaultCompany();
      console.log('   ✅ Default company ID:', chatCompanyId);
    }
    
    if (!chatCompanyId) {
      console.log('❌ No company found even after default lookup');
      return res.status(400).json({
        success: false,
        message: 'No company found in system. Please create a company first.'
      });
    }

    console.log('   📝 Creating/finding chat room with company:', chatCompanyId);

    // Find or create personal chat room
    const room = await ChatRoom.findOrCreatePersonalChat(currentUserId, userId, chatCompanyId);
    
    console.log('   ✅ Chat room:', room._id);

    const populatedRoom = await ChatRoom.findById(room._id)
      .populate('participants', 'name email profilePhoto position status')
      .lean();

    // Get other user
    const otherUser = populatedRoom.participants.find(
      p => p._id.toString() !== currentUserId.toString()
    );

    console.log('   ✅ SUCCESS - Chat room created/found:', populatedRoom._id);

    res.status(200).json({
      success: true,
      data: {
        ...populatedRoom,
        otherUser
      }
    });
  } catch (error) {
    console.error('❌ getOrCreatePersonalChat error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get/create chat room',
      error: error.message
    });
  }
};

// ============================================
// GROUP MANAGEMENT
// ============================================

/**
 * @desc    Create a group chat
 * @route   POST /api/chat/groups
 * @access  Private (Admin/HR only)
 */
exports.createGroup = async (req, res) => {
  try {
    const { name, description, members } = req.body;
    const creatorId = req.user._id;
    let companyId = req.user.company;
    const userRole = req.user.role;

    console.log('👥 createGroup called:');
    console.log('   Creator:', req.user.name, '| Role:', userRole, '| Company:', companyId);
    console.log('   Group name:', name, '| Members:', members?.length || 0);

    // Only Admin and HR can create groups
    if (!['admin', 'hr'].includes(userRole)) {
      console.log('❌ Only Admin/HR can create groups');
      return res.status(403).json({
        success: false,
        message: 'Only Admin and HR can create groups'
      });
    }

    if (!name || name.trim().length < 2) {
      console.log('❌ Group name too short');
      return res.status(400).json({
        success: false,
        message: 'Group name is required (minimum 2 characters)'
      });
    }

    // If admin has no company, get default company
    if (!companyId) {
      console.log('   ⚙️ Admin has no company, getting default...');
      companyId = await getDefaultCompany();
      console.log('   ✅ Default company ID:', companyId);
    }
    
    if (!companyId) {
      console.log('❌ No company found');
      return res.status(400).json({
        success: false,
        message: 'No company found in system. Please create a company first.'
      });
    }

    // Validate members - admin can add anyone, HR can add from same company
    const memberIds = members || [];
    if (memberIds.length > 0) {
      let validMembersQuery = { _id: { $in: memberIds }, status: 'active' };
      
      // HR can only add users from same company + admins
      if (userRole !== 'admin') {
        validMembersQuery.$or = [
          { company: companyId },
          { role: 'admin' }
        ];
      }
      
      const validMembers = await User.find(validMembersQuery).select('_id').lean();
      console.log('   Valid members:', validMembers.length, '/', memberIds.length);

      if (validMembers.length !== memberIds.length) {
        console.log('❌ Some members invalid or from different company');
        return res.status(400).json({
          success: false,
          message: 'Some members are not valid or from your company'
        });
      }
    }

    // Include creator in participants and as admin
    const participants = [...new Set([creatorId.toString(), ...memberIds])];

    console.log('   Creating group with', participants.length, 'participants');

    const group = await ChatRoom.create({
      name: name.trim(),
      type: 'group',
      description: description || '',
      participants,
      admins: [creatorId],
      company: companyId,
      createdBy: creatorId
    });

    console.log('   ✅ Group created:', group._id);

    const populatedGroup = await ChatRoom.findById(group._id)
      .populate('participants', 'name email profilePhoto position')
      .populate('admins', 'name')
      .lean();

    // Emit socket event to notify members
    const io = req.app.get('io');
    if (io) {
      memberIds.forEach(memberId => {
        io.to(`user:${memberId}`).emit('group-created', populatedGroup);
      });
    }

    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      data: populatedGroup
    });
  } catch (error) {
    console.error('❌ createGroup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create group',
      error: error.message
    });
  }
};

/**
 * @desc    Get group details
 * @route   GET /api/chat/groups/:groupId
 * @access  Private
 */
exports.getGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await ChatRoom.findOne({
      _id: groupId,
      type: 'group',
      participants: userId,
      isActive: true
    })
      .populate('participants', 'name email profilePhoto position status')
      .populate('admins', 'name email')
      .populate('createdBy', 'name')
      .lean();

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member'
      });
    }

    res.status(200).json({
      success: true,
      data: group
    });
  } catch (error) {
    console.error('getGroupDetails error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch group details',
      error: error.message
    });
  }
};

/**
 * @desc    Update group details
 * @route   PUT /api/chat/groups/:groupId
 * @access  Private (Group admins only)
 */
exports.updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, description } = req.body;
    const userId = req.user._id;

    const group = await ChatRoom.findOne({
      _id: groupId,
      type: 'group',
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if user is admin
    if (!group.isAdmin(userId) && !['admin', 'hr'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can update group details'
      });
    }

    if (name) group.name = name.trim();
    if (description !== undefined) group.description = description;

    await group.save();

    const updatedGroup = await ChatRoom.findById(group._id)
      .populate('participants', 'name email profilePhoto position')
      .populate('admins', 'name')
      .lean();

    // Notify all members
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('group-updated', updatedGroup);
    }

    res.status(200).json({
      success: true,
      message: 'Group updated successfully',
      data: updatedGroup
    });
  } catch (error) {
    console.error('updateGroup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update group',
      error: error.message
    });
  }
};

/**
 * @desc    Add members to group
 * @route   POST /api/chat/groups/:groupId/members
 * @access  Private (Admin/HR only)
 */
exports.addGroupMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { memberIds } = req.body;
    const userId = req.user._id;
    const companyId = req.user.company;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Member IDs array is required'
      });
    }

    const group = await ChatRoom.findOne({
      _id: groupId,
      type: 'group',
      company: companyId,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check permissions
    if (!group.isAdmin(userId) && !['admin', 'hr'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can add members'
      });
    }

    // Validate new members are from same company
    const validMembers = await User.find({
      _id: { $in: memberIds },
      company: companyId
    }).select('_id name').lean();

    if (validMembers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid members to add'
      });
    }

    // Add new members (avoid duplicates)
    const existingIds = group.participants.map(p => p.toString());
    const newMemberIds = validMembers
      .filter(m => !existingIds.includes(m._id.toString()))
      .map(m => m._id);

    if (newMemberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All specified users are already members'
      });
    }

    group.participants.push(...newMemberIds);
    await group.save();

    const updatedGroup = await ChatRoom.findById(group._id)
      .populate('participants', 'name email profilePhoto position')
      .populate('admins', 'name')
      .lean();

    // Notify group and new members
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('members-added', {
        groupId,
        newMembers: validMembers.filter(m => newMemberIds.some(id => id.toString() === m._id.toString()))
      });

      // Notify new members they were added
      newMemberIds.forEach(memberId => {
        io.to(`user:${memberId}`).emit('added-to-group', updatedGroup);
      });
    }

    res.status(200).json({
      success: true,
      message: `Added ${newMemberIds.length} member(s) to group`,
      data: updatedGroup
    });
  } catch (error) {
    console.error('addGroupMembers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add members',
      error: error.message
    });
  }
};

/**
 * @desc    Remove member from group
 * @route   DELETE /api/chat/groups/:groupId/members/:memberId
 * @access  Private (Admin/HR only)
 */
exports.removeGroupMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const userId = req.user._id;
    const companyId = req.user.company;

    const group = await ChatRoom.findOne({
      _id: groupId,
      type: 'group',
      company: companyId,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check permissions
    if (!group.isAdmin(userId) && !['admin', 'hr'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can remove members'
      });
    }

    // Cannot remove the last admin
    if (group.admins.length === 1 && group.admins[0].toString() === memberId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove the last admin. Assign another admin first.'
      });
    }

    // Check if member exists in group
    if (!group.participants.some(p => p.toString() === memberId)) {
      return res.status(400).json({
        success: false,
        message: 'User is not a member of this group'
      });
    }

    // Remove from participants and admins
    group.participants = group.participants.filter(p => p.toString() !== memberId);
    group.admins = group.admins.filter(a => a.toString() !== memberId);
    await group.save();

    // Notify group and removed member
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('member-removed', { groupId, memberId });
      io.to(`user:${memberId}`).emit('removed-from-group', { groupId });
    }

    res.status(200).json({
      success: true,
      message: 'Member removed from group'
    });
  } catch (error) {
    console.error('removeGroupMember error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove member',
      error: error.message
    });
  }
};

/**
 * @desc    Leave group
 * @route   POST /api/chat/groups/:groupId/leave
 * @access  Private
 */
exports.leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await ChatRoom.findOne({
      _id: groupId,
      type: 'group',
      participants: userId,
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or you are not a member'
      });
    }

    // Cannot leave if last admin
    if (group.admins.length === 1 && group.admins[0].toString() === userId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You are the last admin. Delete the group or assign another admin first.'
      });
    }

    // Remove from participants and admins
    group.participants = group.participants.filter(p => p.toString() !== userId.toString());
    group.admins = group.admins.filter(a => a.toString() !== userId.toString());
    await group.save();

    // Notify group
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${groupId}`).emit('member-left', { groupId, userId: userId.toString() });
    }

    res.status(200).json({
      success: true,
      message: 'Left the group successfully'
    });
  } catch (error) {
    console.error('leaveGroup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave group',
      error: error.message
    });
  }
};

/**
 * @desc    Delete group
 * @route   DELETE /api/chat/groups/:groupId
 * @access  Private (Admin only)
 */
exports.deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const group = await ChatRoom.findOne({
      _id: groupId,
      type: 'group',
      isActive: true
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Only admin role or group creator can delete
    if (userRole !== 'admin' && group.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only system admin or group creator can delete the group'
      });
    }

    // Get all participant IDs before deletion
    const participantIds = group.participants.map(p => p.toString());

    // Soft delete - mark as inactive
    group.isActive = false;
    await group.save();

    // Notify all members
    const io = req.app.get('io');
    if (io) {
      participantIds.forEach(participantId => {
        io.to(`user:${participantId}`).emit('group-deleted', { groupId });
      });
    }

    res.status(200).json({
      success: true,
      message: 'Group deleted successfully'
    });
  } catch (error) {
    console.error('deleteGroup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete group',
      error: error.message
    });
  }
};

// ============================================
// MESSAGES
// ============================================

/**
 * @desc    Get messages in a chat room
 * @route   GET /api/chat/rooms/:roomId/messages
 * @access  Private
 */
exports.getRoomMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;
    const { limit = 50, before } = req.query;

    // Verify user is participant
    const room = await ChatRoom.findOne({
      _id: roomId,
      participants: userId,
      isActive: true
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found or access denied'
      });
    }

    // Build query
    const query = {
      chatRoom: roomId,
      isDeleted: false
    };

    // Cursor-based pagination
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('sender', 'name profilePhoto position')
      .populate('replyTo', 'content sender')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    // Mark messages as read
    await Message.updateMany(
      {
        chatRoom: roomId,
        sender: { $ne: userId },
        isRead: false
      },
      { 
        isRead: true,
        readAt: new Date()
      }
    );

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages.reverse(), // Return in chronological order
      hasMore: messages.length === parseInt(limit)
    });
  } catch (error) {
    console.error('getRoomMessages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
};

/**
 * @desc    Send a message in a chat room
 * @route   POST /api/chat/rooms/:roomId/messages
 * @access  Private
 */
exports.sendRoomMessage = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { content, messageType = 'text', replyTo } = req.body;
    const userId = req.user._id;

    console.log('📤 sendRoomMessage called:');
    console.log('   User:', req.user.name, '| Room:', roomId);
    console.log('   Content:', content?.substring(0, 50), '| Type:', messageType);

    // Verify user is participant
    const room = await ChatRoom.findOne({
      _id: roomId,
      participants: userId,
      isActive: true
    });

    if (!room) {
      console.log('❌ Chat room not found or access denied');
      return res.status(404).json({
        success: false,
        message: 'Chat room not found or access denied'
      });
    }

    console.log('   ✅ Room found:', room.name || 'Personal Chat', '| Company:', room.company);

    // Check if only admins can message (for group announcements)
    if (room.type === 'group' && room.settings && room.settings.onlyAdminsCanMessage) {
      if (!room.isAdmin(userId)) {
        console.log('❌ Only admins can message in this group');
        return res.status(403).json({
          success: false,
          message: 'Only group admins can send messages in this group'
        });
      }
    }

    // Create message - use room's company (not user's company since admin may not have one)
    const message = await Message.create({
      chatRoom: roomId,
      sender: userId,
      receiver: room.type === 'personal' 
        ? room.participants.find(p => p.toString() !== userId.toString())
        : null,
      company: room.company,
      content: content || '',
      messageType,
      isGroupMessage: room.type === 'group',
      groupId: room.type === 'group' ? roomId : null,
      replyTo: replyTo || null
    });

    console.log('   ✅ Message created:', message._id);

    // Update room's last message
    room.lastMessage = {
      content: messageType === 'text' ? content : `[${messageType}]`,
      sender: userId,
      messageType,
      createdAt: message.createdAt
    };
    await room.save();

    // Populate message for response
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name profilePhoto position')
      .populate('replyTo', 'content sender')
      .lean();

    // Real-time broadcast
    const io = req.app.get('io');
    if (io) {
      if (room.type === 'group') {
        io.to(`group:${roomId}`).emit('new-message', populatedMessage);
      } else {
        // Notify both users in personal chat
        room.participants.forEach(participantId => {
          io.to(`user:${participantId}`).emit('new-message', populatedMessage);
        });
      }
    }

    res.status(201).json({
      success: true,
      data: populatedMessage
    });
  } catch (error) {
    console.error('❌ sendRoomMessage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

/**
 * @desc    Upload media and send message
 * @route   POST /api/chat/rooms/:roomId/upload
 * @access  Private
 */
exports.uploadMedia = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    console.log('📤 uploadMedia called:');
    console.log('   User:', req.user.name);
    console.log('   Room ID:', roomId);
    console.log('   File:', req.file ? req.file.originalname : 'No file');

    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    console.log('   File details:', {
      name: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    // Verify user is participant
    const room = await ChatRoom.findOne({
      _id: roomId,
      participants: userId,
      isActive: true
    });

    if (!room) {
      console.log('❌ Room not found or access denied');
      return res.status(404).json({
        success: false,
        message: 'Chat room not found or access denied'
      });
    }

    console.log('   ✅ Room found:', room._id, '| Type:', room.type);

    // Determine message type from MIME
    let messageType = 'document';
    if (req.file.mimetype.startsWith('image/')) {
      messageType = 'image';
    } else if (req.file.mimetype.startsWith('audio/')) {
      messageType = 'voice';
    }

    console.log('   📎 Message type:', messageType);

    // Upload to Cloudinary - use room's company
    const folder = `chat/${room.company}/${messageType}s`;
    console.log('   ☁️  Uploading to Cloudinary:', folder);
    
    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: messageType === 'voice' ? 'video' : 'auto'
    });

    console.log('   ✅ Cloudinary upload successful:', result.secure_url);

    const attachment = {
      url: result.secure_url,
      publicId: result.public_id,
      name: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype
    };

    console.log('   💾 Creating message with attachment...');

    // Create message - use room's company
    const message = await Message.create({
      chatRoom: roomId,
      sender: userId,
      receiver: room.type === 'personal'
        ? room.participants.find(p => p.toString() !== userId.toString())
        : null,
      company: room.company,
      content: req.body.caption || '',
      messageType,
      attachment,
      isGroupMessage: room.type === 'group',
      groupId: room.type === 'group' ? roomId : null
    });

    console.log('   ✅ Message created:', message._id);

    // Update room's last message
    room.lastMessage = {
      content: `📎 ${messageType === 'image' ? 'Photo' : messageType === 'voice' ? 'Voice message' : 'Document'}`,
      sender: userId,
      messageType,
      createdAt: message.createdAt
    };
    await room.save();

    // Populate and broadcast
    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name profilePhoto position')
      .lean();

    console.log('   📡 Broadcasting to other participants...');

    const io = req.app.get('io');
    if (io) {
      if (room.type === 'group') {
        // For groups, broadcast to all members in the group room
        io.to(`group:${roomId}`).emit('new-message', populatedMessage);
        console.log('   ✅ Broadcasted to group:', roomId);
      } else {
        // For personal chats, send to the other participant only
        const otherParticipant = room.participants.find(p => p.toString() !== userId.toString());
        if (otherParticipant) {
          io.to(`user:${otherParticipant}`).emit('new-message', populatedMessage);
          console.log('   ✅ Sent to other participant:', otherParticipant);
        }
      }
    }

    console.log('   ✅ SUCCESS - Media uploaded and sent');

    res.status(201).json({
      success: true,
      data: populatedMessage
    });
  } catch (error) {
    console.error('❌ uploadMedia error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload media',
      error: error.message
    });
  }
};

/**
 * @desc    Delete a message
 * @route   DELETE /api/chat/messages/:messageId
 * @access  Private
 */
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findOne({
      _id: messageId,
      sender: userId,
      isDeleted: false
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or already deleted'
      });
    }

    // Soft delete
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.content = 'This message was deleted';
    await message.save();

    // Notify via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`group:${message.chatRoom}`).emit('message-deleted', { messageId });
      if (message.receiver) {
        io.to(`user:${message.receiver}`).emit('message-deleted', { messageId });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Message deleted'
    });
  } catch (error) {
    console.error('deleteMessage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: error.message
    });
  }
};

/**
 * @desc    Mark messages as read
 * @route   PUT /api/chat/rooms/:roomId/read
 * @access  Private
 */
exports.markRoomAsRead = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const result = await Message.updateMany(
      {
        chatRoom: roomId,
        sender: { $ne: userId },
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );

    // Notify senders that messages were read
    if (result.modifiedCount > 0) {
      const io = req.app.get('io');
      if (io) {
        io.to(`group:${roomId}`).emit('messages-read', {
          roomId,
          readBy: userId.toString(),
          count: result.modifiedCount
        });
      }
    }

    res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('markRoomAsRead error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark as read',
      error: error.message
    });
  }
};

/**
 * @desc    Get total unread message count
 * @route   GET /api/chat/unread
 * @access  Private
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const companyId = req.user.company;

    // Get rooms user is in
    const rooms = await ChatRoom.find({
      company: companyId,
      participants: userId,
      isActive: true
    }).select('_id').lean();

    const roomIds = rooms.map(r => r._id);

    const count = await Message.countDocuments({
      chatRoom: { $in: roomIds },
      sender: { $ne: userId },
      isRead: false,
      isDeleted: false
    });

    res.status(200).json({
      success: true,
      count
    });
  } catch (error) {
    console.error('getUnreadCount error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get unread count',
      error: error.message
    });
  }
};

/**
 * @desc    Search users for starting a chat
 * @route   GET /api/chat/users/search
 * @access  Private
 */
exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;
    const companyId = req.user.company;
    const userId = req.user._id;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    const users = await User.find({
      company: companyId,
      _id: { $ne: userId },
      status: 'active',
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { employeeId: { $regex: q, $options: 'i' } }
      ]
    })
      .select('name email employeeId profilePhoto position department role')
      .limit(20)
      .lean();

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('searchUsers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search users',
      error: error.message
    });
  }
};

/**
 * @desc    Get all company users for starting chat/creating groups
 * @route   GET /api/chat/users
 * @access  Private
 */
exports.getCompanyUsers = async (req, res) => {
  try {
    const companyId = req.user.company;
    const userId = req.user._id;
    const isAdmin = req.user.role === 'admin';

    let users;
    
    if (isAdmin) {
      // Admin can chat with anyone - get all active users
      users = await User.find({
        _id: { $ne: userId },
        status: 'active'
      })
        .select('name email employeeId profilePhoto position department role company')
        .sort({ name: 1 })
        .lean();
    } else {
      // HR/Employees: get users from same company + admins (who have no company)
      users = await User.find({
        _id: { $ne: userId },
        status: 'active',
        $or: [
          { company: companyId },
          { role: 'admin', company: null }
        ]
      })
        .select('name email employeeId profilePhoto position department role')
        .sort({ name: 1 })
        .lean();
    }

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('getCompanyUsers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: error.message
    });
  }
};

// ============================================
// LEGACY API SUPPORT (for backward compatibility)
// ============================================

/**
 * @desc    Get all conversations (legacy)
 * @route   GET /api/chat/conversations
 * @access  Private
 */
exports.getConversations = exports.getChatRooms;

/**
 * @desc    Get messages with a specific user (legacy)
 * @route   GET /api/chat/messages/:userId
 * @access  Private
 */
exports.getMessages = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const otherUserId = req.params.userId;
    const companyId = req.user.company;
    const { limit = 50, before } = req.query;

    // Find or create personal chat room
    const room = await ChatRoom.findOrCreatePersonalChat(currentUserId, otherUserId, companyId);

    // Get messages
    const query = {
      chatRoom: room._id,
      isDeleted: false
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('sender', 'name profilePhoto')
      .populate('receiver', 'name profilePhoto')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    // Mark as read
    await Message.updateMany(
      {
        chatRoom: room._id,
        sender: otherUserId,
        isRead: false
      },
      { isRead: true, readAt: new Date() }
    );

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages.reverse()
    });
  } catch (error) {
    console.error('getMessages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
};

/**
 * @desc    Send a message (legacy)
 * @route   POST /api/chat/send
 * @access  Private
 */
exports.sendMessage = async (req, res) => {
  try {
    const { receiver, content, isGroupMessage, groupId } = req.body;
    const userId = req.user._id;
    const companyId = req.user.company;

    if (!content || (!receiver && !isGroupMessage)) {
      return res.status(400).json({
        success: false,
        message: 'Content and receiver are required'
      });
    }

    let room;
    
    if (isGroupMessage && groupId) {
      // Group message
      room = await ChatRoom.findOne({
        _id: groupId,
        participants: userId,
        isActive: true
      });
    } else {
      // Personal message - find or create room
      const receiverUser = await User.findById(receiver).select('company').lean();
      
      if (!receiverUser || receiverUser.company.toString() !== companyId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Cannot message users outside your company'
        });
      }

      room = await ChatRoom.findOrCreatePersonalChat(userId, receiver, companyId);
    }

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Create message
    const message = await Message.create({
      chatRoom: room._id,
      sender: userId,
      receiver: isGroupMessage ? null : receiver,
      company: companyId,
      content,
      messageType: 'text',
      isGroupMessage: !!isGroupMessage,
      groupId: isGroupMessage ? groupId : null
    });

    // Update room's last message
    room.lastMessage = {
      content,
      sender: userId,
      messageType: 'text',
      createdAt: message.createdAt
    };
    await room.save();

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name profilePhoto')
      .populate('receiver', 'name profilePhoto')
      .lean();

    // Broadcast
    const io = req.app.get('io');
    if (io) {
      if (isGroupMessage) {
        io.to(`group:${groupId}`).emit('new-message', populatedMessage);
      } else {
        io.to(`user:${receiver}`).emit('new-message', populatedMessage);
      }
    }

    res.status(201).json({
      success: true,
      data: populatedMessage
    });
  } catch (error) {
    console.error('sendMessage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

/**
 * @desc    Get group messages (legacy)
 * @route   GET /api/chat/groups/:groupId/messages
 * @access  Private
 */
exports.getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;
    const { limit = 50, before } = req.query;

    // Verify membership
    const room = await ChatRoom.findOne({
      _id: groupId,
      participants: userId,
      isActive: true
    });

    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Group not found or access denied'
      });
    }

    const query = {
      chatRoom: groupId,
      isDeleted: false
    };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('sender', 'name profilePhoto position')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages.reverse()
    });
  } catch (error) {
    console.error('getGroupMessages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch group messages',
      error: error.message
    });
  }
};

/**
 * @desc    Mark messages as read (legacy)
 * @route   PUT /api/chat/read/:userId
 * @access  Private
 */
exports.markAsRead = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const otherUserId = req.params.userId;
    const companyId = req.user.company;

    // Find the chat room
    const room = await ChatRoom.findOrCreatePersonalChat(currentUserId, otherUserId, companyId);

    const result = await Message.updateMany(
      {
        chatRoom: room._id,
        sender: otherUserId,
        isRead: false
      },
      { isRead: true, readAt: new Date() }
    );

    const io = req.app.get('io');
    if (io && result.modifiedCount > 0) {
      io.to(`user:${otherUserId}`).emit('messages-read', {
        readBy: currentUserId.toString(),
        count: result.modifiedCount
      });
    }

    res.status(200).json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('markAsRead error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark as read',
      error: error.message
    });
  }
};

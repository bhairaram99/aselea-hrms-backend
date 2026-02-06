/**
 * CHAT SOCKET HANDLER - Real-time WhatsApp-like Messaging
 * 
 * Complete Socket.io implementation with:
 * - JWT authentication
 * - Company-based isolation
 * - Personal and group messaging
 * - Media message support
 * - Typing indicators
 * - Online/offline status
 * - Read receipts
 * - Message persistence
 * 
 * Socket Events:
 * CLIENT -> SERVER:
 *   - 'join-room' - Join a chat room (personal or group)
 *   - 'leave-room' - Leave a chat room
 *   - 'send-message' - Send a message
 *   - 'typing' - User is typing
 *   - 'stop-typing' - User stopped typing
 *   - 'mark-read' - Mark messages as read
 *   - 'get-online-users' - Get list of online users
 * 
 * SERVER -> CLIENT:
 *   - 'new-message' - New message received
 *   - 'message-sent' - Message delivery confirmation
 *   - 'messages-read' - Messages marked as read
 *   - 'user-typing' - User is typing in chat
 *   - 'user-stopped-typing' - User stopped typing
 *   - 'user-online' - User came online
 *   - 'user-offline' - User went offline
 *   - 'online-users' - List of online users
 *   - 'room-joined' - Successfully joined a room
 *   - 'group-created' - New group created
 *   - 'added-to-group' - Added to a group
 *   - 'removed-from-group' - Removed from a group
 *   - 'group-deleted' - Group was deleted
 *   - 'error' - Error occurred
 */

const jwt = require('jsonwebtoken');
const Message = require('../models/Message.model');
const ChatRoom = require('../models/ChatRoom.model');
const User = require('../models/User.model');

// Store active socket connections: userId -> Set of socketIds (user can have multiple tabs)
const activeUsers = new Map();

// Store user metadata: socketId -> { userId, companyId, name }
const socketMetadata = new Map();

/**
 * Initialize Socket.io chat system
 * @param {SocketIO.Server} io - Socket.io server instance
 */
const initializeChatSocket = (io) => {
  
  // ============================================
  // MIDDLEWARE: JWT Authentication
  // ============================================
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Fetch user from database
      const user = await User.findById(decoded.id).select('-password').lean();
      
      if (!user) {
        return next(new Error('User not found'));
      }

      if (user.status !== 'active') {
        return next(new Error('User account is not active'));
      }

      // Attach user to socket object
      socket.user = user;
      next();
    } catch (error) {
      console.error('Socket authentication error:', error.message);
      next(new Error('Invalid or expired token'));
    }
  });

  // ============================================
  // CONNECTION HANDLER
  // ============================================
  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    const companyId = socket.user.company ? socket.user.company.toString() : null;
    const userName = socket.user.name;
    const userRole = socket.user.role;

    console.log(`✅ User connected: ${userName} (${userRole}) | Socket: ${socket.id}`);

    // Store active user (support multiple connections per user)
    if (!activeUsers.has(userId)) {
      activeUsers.set(userId, new Set());
    }
    activeUsers.get(userId).add(socket.id);

    // Store socket metadata
    socketMetadata.set(socket.id, {
      userId,
      companyId,
      name: userName,
      role: userRole,
      connectedAt: new Date()
    });

    // Join user's personal room (for private messages)
    socket.join(`user:${userId}`);

    // Join company room (for company-wide broadcasts)
    if (companyId) {
      socket.join(`company:${companyId}`);
    }

    // Auto-join all group rooms user is a member of
    try {
      const userRooms = await ChatRoom.find({
        participants: userId,
        type: 'group',
        isActive: true
      }).select('_id').lean();

      userRooms.forEach(room => {
        socket.join(`group:${room._id}`);
      });
      
      if (userRooms.length > 0) {
        console.log(`👥 ${userName} auto-joined ${userRooms.length} group(s)`);
      }
    } catch (err) {
      console.error('Error auto-joining groups:', err.message);
    }

    // Notify others in same company that user is online
    socket.to(`company:${companyId}`).emit('user-online', {
      userId,
      userName,
      timestamp: new Date()
    });

    // ============================================
    // EVENT: Join Chat Room
    // ============================================
    socket.on('join-room', async (roomId) => {
      try {
        // Verify room exists and user is a participant
        const room = await ChatRoom.findOne({
          _id: roomId,
          participants: userId,
          isActive: true
        }).lean();

        if (!room) {
          return socket.emit('error', { message: 'Room not found or access denied' });
        }

        const socketRoom = room.type === 'group' ? `group:${roomId}` : `room:${roomId}`;
        socket.join(socketRoom);
        
        console.log(`💬 ${userName} joined room: ${roomId}`);

        socket.emit('room-joined', { 
          roomId, 
          roomType: room.type,
          roomName: room.name || null
        });
      } catch (error) {
        console.error('Join room error:', error);
        socket.emit('error', { message: 'Failed to join room', error: error.message });
      }
    });

    // ============================================
    // EVENT: Leave Chat Room
    // ============================================
    socket.on('leave-room', (roomId) => {
      socket.leave(`group:${roomId}`);
      socket.leave(`room:${roomId}`);
      console.log(`👋 ${userName} left room: ${roomId}`);
    });

    // ============================================
    // EVENT: Send Message
    // ============================================
    socket.on('send-message', async (data) => {
      try {
        const { roomId, content, messageType = 'text', tempId, replyTo, attachment } = data;

        console.log(`📤 ${userName} sending message to room ${roomId}`);

        // Validation
        if (!roomId) {
          console.log('❌ No room ID provided');
          return socket.emit('error', { message: 'Room ID is required' });
        }

        if (messageType === 'text' && (!content || content.trim().length === 0)) {
          console.log('❌ Empty message content');
          return socket.emit('error', { message: 'Message content is required' });
        }

        // Verify room and membership
        const room = await ChatRoom.findOne({
          _id: roomId,
          participants: userId,
          isActive: true
        });

        if (!room) {
          console.log('❌ Room not found or access denied');
          return socket.emit('error', { message: 'Room not found or access denied' });
        }

        console.log(`✅ Room found:`, room.name || 'Personal', '| Company:', room.company);

        // Check if only admins can message (for announcement groups)
        if (room.type === 'group' && room.settings && room.settings.onlyAdminsCanMessage) {
          if (!room.isAdmin(userId)) {
            console.log('❌ Only admins can message');
            return socket.emit('error', { 
              message: 'Only group admins can send messages in this group' 
            });
          }
        }

        // Create message in database - USE ROOM'S COMPANY, NOT USER'S COMPANY
        const message = await Message.create({
          chatRoom: roomId,
          sender: userId,
          receiver: room.type === 'personal' 
            ? room.participants.find(p => p.toString() !== userId)
            : null,
          company: room.company, // FIXED: Use room's company instead of user's company
          content: content ? content.trim() : '',
          messageType,
          attachment: attachment || null,
          isGroupMessage: room.type === 'group',
          groupId: room.type === 'group' ? roomId : null,
          replyTo: replyTo || null
        });

        console.log(`✅ Message created:`, message._id);

        // Update room's last message
        room.lastMessage = {
          content: messageType === 'text' ? content.trim() : `[${messageType}]`,
          sender: userId,
          messageType,
          createdAt: message.createdAt
        };
        await room.save();

        // Populate message
        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'name profilePhoto position')
          .populate('replyTo', 'content sender')
          .lean();

        // Broadcast to room participants (EXCLUDE SENDER to avoid duplicates)
        if (room.type === 'group') {
          // Broadcast to all group members except sender
          socket.to(`group:${roomId}`).emit('new-message', populatedMessage);
        } else {
          // For personal chats, notify only the OTHER participant (not sender)
          const otherParticipant = room.participants.find(p => p.toString() !== userId);
          if (otherParticipant) {
            io.to(`user:${otherParticipant}`).emit('new-message', populatedMessage);
          }
        }

        // Send confirmation to sender (frontend will handle this with tempId)
        socket.emit('message-sent', {
          tempId,
          message: populatedMessage
        });

        console.log(`📨 Message sent successfully`);

      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { 
          message: 'Failed to send message', 
          error: error.message 
        });
      }
    });

    // ============================================
    // EVENT: Typing Indicator
    // ============================================
    socket.on('typing', async (data) => {
      try {
        const { roomId } = data;

        if (!roomId) return;

        // Verify room membership
        const room = await ChatRoom.findOne({
          _id: roomId,
          participants: userId,
          isActive: true
        }).lean();

        if (!room) return;

        const typingData = {
          userId,
          userName,
          roomId
        };

        if (room.type === 'group') {
          socket.to(`group:${roomId}`).emit('user-typing', typingData);
        } else {
          // Notify the other participant
          const otherUserId = room.participants.find(p => p.toString() !== userId);
          if (otherUserId) {
            io.to(`user:${otherUserId}`).emit('user-typing', typingData);
          }
        }
      } catch (error) {
        console.error('Typing indicator error:', error);
      }
    });

    // ============================================
    // EVENT: Stop Typing Indicator
    // ============================================
    socket.on('stop-typing', async (data) => {
      try {
        const { roomId } = data;

        if (!roomId) return;

        const room = await ChatRoom.findOne({
          _id: roomId,
          participants: userId,
          isActive: true
        }).lean();

        if (!room) return;

        const typingData = {
          userId,
          userName,
          roomId
        };

        if (room.type === 'group') {
          socket.to(`group:${roomId}`).emit('user-stopped-typing', typingData);
        } else {
          const otherUserId = room.participants.find(p => p.toString() !== userId);
          if (otherUserId) {
            io.to(`user:${otherUserId}`).emit('user-stopped-typing', typingData);
          }
        }
      } catch (error) {
        console.error('Stop typing error:', error);
      }
    });

    // ============================================
    // EVENT: Mark Messages as Read
    // ============================================
    socket.on('mark-read', async (data) => {
      try {
        const { roomId } = data;

        if (!roomId) return;

        // Update messages as read
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

        if (result.modifiedCount > 0) {
          // Get room to notify others
          const room = await ChatRoom.findById(roomId).lean();
          
          if (room) {
            const readData = {
              roomId,
              readBy: userId,
              readByName: userName,
              count: result.modifiedCount,
              timestamp: new Date()
            };

            if (room.type === 'group') {
              socket.to(`group:${roomId}`).emit('messages-read', readData);
            } else {
              const otherUserId = room.participants.find(p => p.toString() !== userId);
              if (otherUserId) {
                io.to(`user:${otherUserId}`).emit('messages-read', readData);
              }
            }
          }

          console.log(`✓ ${userName} read ${result.modifiedCount} messages in room ${roomId}`);
        }
      } catch (error) {
        console.error('Mark as read error:', error);
        socket.emit('error', { 
          message: 'Failed to mark messages as read', 
          error: error.message 
        });
      }
    });

    // ============================================
    // EVENT: Get Online Users
    // ============================================
    socket.on('get-online-users', () => {
      try {
        const onlineUsersInCompany = [];
        
        for (const [uid, sockets] of activeUsers.entries()) {
          if (sockets.size > 0 && uid !== userId) {
            // Get metadata from any of user's sockets
            const socketId = sockets.values().next().value;
            const meta = socketMetadata.get(socketId);
            
            if (meta && meta.companyId === companyId) {
              onlineUsersInCompany.push({
                userId: uid,
                userName: meta.name,
                role: meta.role
              });
            }
          }
        }

        socket.emit('online-users', onlineUsersInCompany);
      } catch (error) {
        console.error('Get online users error:', error);
      }
    });

    // ============================================
    // DISCONNECTION HANDLER
    // ============================================
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${userName} | Socket: ${socket.id}`);

      // Remove socket from active users
      if (activeUsers.has(userId)) {
        activeUsers.get(userId).delete(socket.id);
        
        // If user has no more active sockets, they're fully offline
        if (activeUsers.get(userId).size === 0) {
          activeUsers.delete(userId);
          
          // Notify others in same company
          socket.to(`company:${companyId}`).emit('user-offline', {
            userId,
            userName,
            timestamp: new Date()
          });
        }
      }

      // Clean up socket metadata
      socketMetadata.delete(socket.id);
    });

    // ============================================
    // ERROR HANDLER
    // ============================================
    socket.on('error', (error) => {
      console.error(`Socket error for user ${userId}:`, error);
    });
  });

  console.log('🔌 Chat Socket system initialized');
};

/**
 * Check if user is online
 */
const isUserOnline = (userId) => {
  return activeUsers.has(userId) && activeUsers.get(userId).size > 0;
};

/**
 * Get active users count
 */
const getActiveUsersCount = () => {
  return activeUsers.size;
};

/**
 * Get active users by company
 */
const getActiveUsersByCompany = (companyId) => {
  const users = [];
  for (const [userId, sockets] of activeUsers.entries()) {
    if (sockets.size > 0) {
      const socketId = sockets.values().next().value;
      const meta = socketMetadata.get(socketId);
      if (meta && meta.companyId === companyId) {
        users.push({ userId, ...meta });
      }
    }
  }
  return users;
};

/**
 * Get socket IDs for a user (for emitting from REST API)
 */
const getUserSockets = (userId) => {
  return activeUsers.get(userId) || new Set();
};

module.exports = {
  initializeChatSocket,
  isUserOnline,
  getActiveUsersCount,
  getActiveUsersByCompany,
  getUserSockets
};

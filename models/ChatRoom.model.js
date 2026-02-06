const mongoose = require('mongoose');

/**
 * ChatRoom Model - Supports both personal and group chats
 * 
 * Personal chats: type='personal', participants has exactly 2 users
 * Group chats: type='group', can have multiple members, has admin controls
 */
const chatRoomSchema = new mongoose.Schema({
  // Room name (only for groups)
  name: {
    type: String,
    required: function() { return this.type === 'group'; },
    trim: true,
    maxlength: 100
  },

  // Room type: personal (1-1) or group
  type: {
    type: String,
    enum: ['personal', 'group'],
    required: true
  },

  // For personal chats - exactly 2 participants
  // For group chats - all members
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Group admins (can add/remove members, delete group)
  // For personal chats, this is empty
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Company association - CRITICAL for isolation
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },

  // Who created the room
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Last message for preview in chat list
  lastMessage: {
    content: String,
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'document', 'voice']
    },
    createdAt: Date
  },

  // Group avatar/icon (Cloudinary URL)
  avatar: {
    url: String,
    publicId: String
  },

  // Group description
  description: {
    type: String,
    maxlength: 500
  },

  // Room status
  isActive: {
    type: Boolean,
    default: true
  },

  // Settings
  settings: {
    // Only admins can send messages (announcement mode)
    onlyAdminsCanMessage: {
      type: Boolean,
      default: false
    },
    // Mute notifications for all
    isMuted: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true
});

// INDEXES for performance
chatRoomSchema.index({ company: 1, type: 1 });
chatRoomSchema.index({ participants: 1 });
chatRoomSchema.index({ 'lastMessage.createdAt': -1 });
chatRoomSchema.index({ company: 1, isActive: 1 });

// Virtual for member count
chatRoomSchema.virtual('memberCount').get(function() {
  return this.participants ? this.participants.length : 0;
});

// Ensure virtuals are included in JSON
chatRoomSchema.set('toJSON', { virtuals: true });
chatRoomSchema.set('toObject', { virtuals: true });

/**
 * Static method to find or create a personal chat room between two users
 */
chatRoomSchema.statics.findOrCreatePersonalChat = async function(user1Id, user2Id, companyId) {
  // Sort IDs to ensure consistent room lookup
  const participants = [user1Id, user2Id].sort();
  
  let room = await this.findOne({
    type: 'personal',
    participants: { $all: participants, $size: 2 },
    company: companyId
  });

  if (!room) {
    room = await this.create({
      type: 'personal',
      participants,
      company: companyId,
      createdBy: user1Id
    });
  }

  return room;
};

/**
 * Check if user is a participant in the room
 */
chatRoomSchema.methods.isParticipant = function(userId) {
  return this.participants.some(p => p.toString() === userId.toString());
};

/**
 * Check if user is an admin of the room
 */
chatRoomSchema.methods.isAdmin = function(userId) {
  return this.admins.some(a => a.toString() === userId.toString());
};

module.exports = mongoose.model('ChatRoom', chatRoomSchema);

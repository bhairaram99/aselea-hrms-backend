const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Reference to chat room
  chatRoom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom',
    required: true
  },

  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // For personal messages only (legacy support + quick queries)
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Company association - CRITICAL for isolation
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },

  // Message content (text for text messages, caption for media)
  content: {
    type: String,
    default: ''
  },

  // Message type for WhatsApp-like functionality
  messageType: {
    type: String,
    enum: ['text', 'image', 'document', 'voice'],
    default: 'text'
  },

  // Media attachment (for image, document, voice)
  attachment: {
    url: String,
    publicId: String, // Cloudinary public ID
    name: String, // Original filename
    size: Number, // File size in bytes
    mimeType: String, // MIME type
    duration: Number // For voice messages (seconds)
  },

  // Legacy support - replaced by chatRoom.type === 'group'
  isGroupMessage: {
    type: Boolean,
    default: false
  },

  // Legacy support - replaced by chatRoom reference
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom'
  },

  // Read status
  isRead: {
    type: Boolean,
    default: false
  },

  // Read timestamp
  readAt: {
    type: Date,
    default: null
  },

  // Read by (for group messages - track who has read)
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: Date
  }],

  // Delivery status
  status: {
    type: String,
    enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },

  // Reply to another message
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },

  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false
  },

  deletedAt: Date
}, {
  timestamps: true
});

// PERFORMANCE: Indexes for efficient queries
messageSchema.index({ chatRoom: 1, createdAt: -1 }); // Chat room messages (main query)
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 }); // Conversation history (legacy)
messageSchema.index({ receiver: 1, isRead: 1 }); // Unread messages
messageSchema.index({ company: 1, createdAt: -1 }); // Company isolation
messageSchema.index({ groupId: 1, createdAt: -1 }); // Group messages (legacy)
messageSchema.index({ chatRoom: 1, isRead: 1 }); // Unread in room

// Virtual to check if message has attachment
messageSchema.virtual('hasAttachment').get(function() {
  return this.messageType !== 'text' && this.attachment && this.attachment.url;
});

// Ensure virtuals are included in JSON
messageSchema.set('toJSON', { virtuals: true });
messageSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Message', messageSchema);

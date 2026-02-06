const multer = require('multer');
const path = require('path');

// Configure multer for memory storage (we'll upload to Cloudinary)
const storage = multer.memoryStorage();

// File filter to accept images, documents, and audio
const fileFilter = (req, file, cb) => {
  const imageTypes = /jpeg|jpg|png|gif|webp/;
  const documentTypes = /pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv/;
  const audioTypes = /mp3|wav|ogg|webm|m4a/;
  
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  
  // Check if file extension matches allowed types
  if (imageTypes.test(ext) || documentTypes.test(ext) || audioTypes.test(ext)) {
    return cb(null, true);
  }
  
  // Also check mimetype for common types
  if (file.mimetype.startsWith('image/') || 
      file.mimetype.startsWith('audio/') ||
      file.mimetype === 'application/pdf' ||
      file.mimetype.includes('document') ||
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('presentation') ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'text/csv') {
    return cb(null, true);
  }
  
  cb(new Error('File type not allowed!'));
};

// Create multer upload instance
const upload = multer({
  storage: storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit for chat files
  fileFilter: fileFilter
});

module.exports = upload;
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// Configure cloudinary (make sure env variables are set)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload file buffer to Cloudinary
 * @param {Buffer} buffer - File buffer from multer memory storage
 * @param {Object} options - Upload options (folder, resource_type, etc.)
 * @returns {Promise<Object>} - Full Cloudinary upload result
 */
const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const defaultOptions = {
      folder: options.folder || 'uploads',
      resource_type: options.resource_type || 'auto',
    };

    // Add image transformations only for images
    if (defaultOptions.resource_type === 'image' || defaultOptions.resource_type === 'auto') {
      defaultOptions.transformation = [
        { width: 1920, height: 1920, crop: 'limit' },
        { quality: 'auto' }
      ];
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      { ...defaultOptions, ...options },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', error);
          reject(error);
        } else {
          console.log('✅ Cloudinary upload success:', result.public_id);
          resolve(result); // Return full result object
        }
      }
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

module.exports = { uploadToCloudinary };
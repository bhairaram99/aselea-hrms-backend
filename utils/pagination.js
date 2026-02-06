/**
 * PAGINATION UTILITY
 * 
 * Provides reusable pagination logic for API endpoints
 */

/**
 * Parse pagination parameters from request query
 * @param {Object} query - Request query object
 * @returns {Object} - Pagination parameters
 */
const getPaginationParams = (query) => {
  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Enforce max limit to prevent abuse
  const maxLimit = 100;
  const finalLimit = Math.min(limit, maxLimit);

  return {
    page,
    limit: finalLimit,
    skip
  };
};

/**
 * Generate pagination response metadata
 * @param {Number} page - Current page
 * @param {Number} limit - Items per page
 * @param {Number} total - Total count of items
 * @returns {Object} - Pagination metadata
 */
const getPaginationMeta = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    currentPage: page,
    totalPages,
    totalItems: total,
    itemsPerPage: limit,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  };
};

/**
 * Apply pagination to a Mongoose query
 * @param {Object} Model - Mongoose model
 * @param {Object} filter - Query filter
 * @param {Object} options - Query options (populate, select, sort, lean)
 * @param {Object} paginationParams - Pagination params
 * @returns {Promise<Object>} - Paginated results with metadata
 */
const paginate = async (Model, filter, options = {}, paginationParams) => {
  const {
    populate = null,
    select = null,
    sort = { createdAt: -1 },
    lean = true
  } = options;

  const { page, limit, skip } = paginationParams;

  // Build query
  let query = Model.find(filter);

  if (select) query = query.select(select);
  if (populate) query = query.populate(populate);
  if (sort) query = query.sort(sort);
  if (lean) query = query.lean();

  // Execute query with pagination
  const [data, total] = await Promise.all([
    query.skip(skip).limit(limit),
    Model.countDocuments(filter)
  ]);

  return {
    data,
    pagination: getPaginationMeta(page, limit, total)
  };
};

module.exports = {
  getPaginationParams,
  getPaginationMeta,
  paginate
};

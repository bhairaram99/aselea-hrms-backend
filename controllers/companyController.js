/**
 * COMPANY CONTROLLER - Handles company CRUD operations
 * 
 * Manages company registration, updates, and retrieval
 */

const Company = require('../models/Company.model');
const User = require('../models/User.model');

/**
 * @desc    Get all companies
 * @route   GET /api/companies
 * @access  Private (Admin only)
 */
exports.getAllCompanies = async (req, res) => {
  try {
    const { status, search } = req.query;
    const filter = {};

    if (status) filter.status = status;

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const companies = await Company.find(filter)
      .populate('hrManager', 'name email phone')
      .sort({ createdAt: -1 })
      .lean();

    // Get employee and HR counts for each company
    const companiesWithStats = await Promise.all(
      companies.map(async (company) => {
        const employeeCount = await User.countDocuments({
          company: company._id,
          role: 'employee'
        });
        const hrCount = await User.countDocuments({
          company: company._id,
          role: 'hr'
        });

        return {
          ...company,
          employeeCount,
          hrCount
        };
      })
    );

    res.status(200).json({
      success: true,
      count: companiesWithStats.length,
      data: companiesWithStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch companies',
      error: error.message
    });
  }
};

/**
 * @desc    Get company by ID
 * @route   GET /api/companies/:id
 * @access  Private
 */
exports.getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate('hrManager', 'name email phone position')
      .lean();

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Get employee count
    const employeeCount = await User.countDocuments({
      company: company._id,
      role: 'employee'
    });

    const hrCount = await User.countDocuments({
      company: company._id,
      role: 'hr'
    });

    res.status(200).json({
      success: true,
      data: {
        ...company,
        employeeCount,
        hrCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch company',
      error: error.message
    });
  }
};

/**
 * @desc    Create new company
 * @route   POST /api/companies
 * @access  Private (Admin only)
 */
exports.createCompany = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      website,
      industry,
      size
    } = req.body;

    // Check if company with email already exists
    const existingCompany = await Company.findOne({ email });

    if (existingCompany) {
      return res.status(400).json({
        success: false,
        message: 'Company with this email already exists'
      });
    }

    const company = await Company.create({
      name,
      email,
      phone,
      address,
      website,
      industry,
      size,
      status: 'active'
    });

    res.status(201).json({
      success: true,
      message: 'Company created successfully',
      data: company
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create company',
      error: error.message
    });
  }
};

/**
 * @desc    Update company
 * @route   PUT /api/companies/:id
 * @access  Private (Admin only)
 */
exports.updateCompany = async (req, res) => {
  try {
    // Don't allow updating subscription through this route
    delete req.body.subscription;

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Company updated successfully',
      data: company
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update company',
      error: error.message
    });
  }
};

/**
 * @desc    Delete company
 * @route   DELETE /api/companies/:id
 * @access  Private (Admin only)
 */
exports.deleteCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Check if company has employees
    const employeeCount = await User.countDocuments({ company: company._id });

    if (employeeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete company with ${employeeCount} employees. Please reassign or remove employees first.`
      });
    }

    await company.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Company deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete company',
      error: error.message
    });
  }
};

/**
 * @desc    Get company statistics
 * @route   GET /api/companies/:id/stats
 * @access  Private
 */
exports.getCompanyStats = async (req, res) => {
  try {
    const companyId = req.params.id;

    const [
      employeeCount,
      hrCount,
      departmentStats,
      statusStats
    ] = await Promise.all([
      User.countDocuments({ company: companyId, role: 'employee' }),
      User.countDocuments({ company: companyId, role: 'hr' }),
      User.aggregate([
        { $match: { company: companyId, role: 'employee' } },
        {
          $group: {
            _id: '$department',
            count: { $sum: 1 }
          }
        }
      ]),
      User.aggregate([
        { $match: { company: companyId, role: 'employee' } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    res.status(200).json({
      success: true,
      data: {
        employees: {
          total: employeeCount,
          byDepartment: departmentStats,
          byStatus: statusStats
        },
        hrCount
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch company statistics',
      error: error.message
    });
  }
};

/**
 * @desc    Activate/Deactivate company
 * @route   PUT /api/companies/:id/status
 * @access  Private (Admin only)
 */
exports.updateCompanyStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be active, inactive, or suspended'
      });
    }

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    res.status(200).json({
      success: true,
      message: `Company ${status} successfully`,
      data: company
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update company status',
      error: error.message
    });
  }
};

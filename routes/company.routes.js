const express = require('express');
const { protect, authorize } = require('../middleware/auth.middleware');
const companyController = require('../controllers/companyController');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Admin only routes
router.get('/', authorize('admin'), companyController.getAllCompanies);
router.post('/', authorize('admin'), companyController.createCompany);
router.put('/:id', authorize('admin'), companyController.updateCompany);
router.delete('/:id', authorize('admin'), companyController.deleteCompany);
router.put('/:id/status', authorize('admin'), companyController.updateCompanyStatus);

// All authenticated users can view company details
router.get('/:id', companyController.getCompanyById);
router.get('/:id/stats', companyController.getCompanyStats);

module.exports = router;

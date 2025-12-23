const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/admin/login', authController.loginSuperAdmin);
router.post('/reseller/login', authController.loginReseller);

module.exports = router;
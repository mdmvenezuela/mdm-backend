const express = require('express');
const router = express.Router();
const superAdminController = require('../controllers/superAdminController');
const managedPlayController = require('../controllers/managedPlayController');
const { authenticateToken, isSuperAdmin } = require('../middleware/auth');

// Todas las rutas requieren autenticación y rol de super admin
router.use(authenticateToken, isSuperAdmin);

router.get('/dashboard', superAdminController.getDashboard);
router.post('/reseller', superAdminController.createReseller);
router.get('/resellers', superAdminController.getResellers);
router.post('/reseller/:id/licenses', superAdminController.addLicenses);
router.put('/reseller/:id/toggle', superAdminController.toggleResellerStatus);
router.get('/devices', superAdminController.getAllDevices);
router.get('/managed-google-play', managedPlayController.getManagedPlayIframe);

module.exports = router;
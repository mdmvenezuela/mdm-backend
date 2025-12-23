const express = require('express');
const router = express.Router();
const resellerController = require('../controllers/resellerController');
const { authenticateToken, isReseller } = require('../middleware/auth');

// Todas las rutas requieren autenticación y rol de reseller
router.use(authenticateToken, isReseller);

router.get('/dashboard', resellerController.getDashboard);
router.post('/qr/generate', resellerController.generateEnrollmentQR);
router.get('/devices', resellerController.getDevices);
router.get('/device/:id', resellerController.getDeviceDetail);
router.post('/device/:id/lock', resellerController.lockDevice);
router.post('/device/:id/unlock', resellerController.unlockDevice);
router.delete('/device/:id/release', resellerController.releaseDevice);
router.get('/device/:id/location/history', resellerController.getDeviceLocationHistory);

module.exports = router;
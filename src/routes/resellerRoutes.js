const express = require('express');
const router = express.Router();
const resellerController = require('../controllers/resellerController');
const { authenticateToken } = require('../middleware/auth');

// Dashboard
router.get('/dashboard', authenticateToken, resellerController.getDashboard);

// Enrollment QR
router.post('/qr/generate', authenticateToken, resellerController.generateEnrollmentQR);

// Dispositivos
router.get('/devices', authenticateToken, resellerController.getDevices);
router.get('/device/:id/detail', authenticateToken, resellerController.getDeviceDetail);

// Control de dispositivos
router.post('/device/:id/lock', authenticateToken, resellerController.lockDevice);
router.post('/device/:id/unlock', authenticateToken, resellerController.unlockDevice);
router.post('/device/:id/reboot', authenticateToken, resellerController.rebootDevice);
router.delete('/device/:id/release', authenticateToken, resellerController.releaseDevice);

// Edición de información del cliente
router.put('/device/:id/client-info', authenticateToken, resellerController.updateClientInfo);

// Ubicación
router.post('/device/:id/request-location', authenticateToken, resellerController.requestDeviceLocation);
router.get('/device/:id/location-history', authenticateToken, resellerController.getDeviceLocationHistory);
router.get('/device/:id/frequent-places', authenticateToken, resellerController.getDeviceFrequentPlaces);
router.get('/device/:id/location', authenticateToken, resellerController.getDeviceLocation);

// Políticas
router.get('/policies/available', authenticateToken, resellerController.getAvailablePolicies);
router.post('/device/:id/change-policy', authenticateToken, resellerController.changeDevicePolicy);

module.exports = router;
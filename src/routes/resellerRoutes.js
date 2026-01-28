// ===================================================
// RUTAS DE RESELLER - VERSIÓN COMPLETA Y CORREGIDA
// Archivo: routes/resellerRoutes.js
// ===================================================

const express = require('express');
const router = express.Router();
const resellerController = require('../controllers/resellerController');
const { authenticateToken } = require('../middleware/auth');

// ===================================================
// DASHBOARD
// ===================================================
router.get('/dashboard', authenticateToken, resellerController.getDashboard);

// ===================================================
// ENROLLMENT QR
// ===================================================
router.post('/qr/generate', authenticateToken, resellerController.generateEnrollmentQR);

// ===================================================
// DISPOSITIVOS - LISTADO Y DETALLE
// ===================================================
router.get('/devices', authenticateToken, resellerController.getDevices);
router.get('/device/:id/detail', authenticateToken, resellerController.getDeviceDetail);

// ===================================================
// CONTROL DE DISPOSITIVOS - ACCIONES REMOTAS
// ===================================================

// Bloquear/Desbloquear
router.post('/device/:id/lock', authenticateToken, resellerController.lockDevice);
router.post('/device/:id/unlock', authenticateToken, resellerController.unlockDevice);

// Reiniciar
router.post('/device/:id/reboot', authenticateToken, resellerController.rebootDevice);

// Liberar
router.delete('/device/:id/release', authenticateToken, resellerController.releaseDevice);

// ===================================================
// EDICIÓN DE INFORMACIÓN DEL CLIENTE
// ===================================================
router.put('/device/:id/client-info', authenticateToken, resellerController.updateClientInfo);

// ===================================================
// UBICACIÓN
// ===================================================

// Solicitar ubicación en tiempo real
router.post('/device/:id/request-location', authenticateToken, resellerController.requestDeviceLocation);

// Obtener historial de ubicaciones
router.get('/device/:id/location-history', authenticateToken, resellerController.getDeviceLocationHistory);

// Obtener lugares frecuentes
router.get('/device/:id/frequent-places', authenticateToken, resellerController.getDeviceFrequentPlaces);

// Obtener ubicación actual (alternativa)
router.get('/device/:id/location', authenticateToken, resellerController.getDeviceLocation);

// ===================================================
// POLÍTICAS
// ===================================================

// Listar políticas disponibles
router.get('/policies/available', authenticateToken, resellerController.getAvailablePolicies);

// Cambiar política de un dispositivo
router.post('/device/:id/change-policy', authenticateToken, resellerController.changeDevicePolicy);

module.exports = router;
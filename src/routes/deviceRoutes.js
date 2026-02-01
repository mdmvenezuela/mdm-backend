const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');

// ===================================================
// RUTAS PÚBLICAS - Llamadas por la app Android
// ===================================================

// Registro inicial del dispositivo
router.post('/register', deviceController.registerDevice);

// Ubicación
router.post('/location', deviceController.updateLocation);

// Comandos (polling)
router.get('/commands', deviceController.getCommands);

// Heartbeat
router.post('/heartbeat', deviceController.heartbeat);

// ===================================================
// NUEVAS RUTAS - FCM y Códigos Únicos
// ===================================================

// Registrar/actualizar token FCM
router.post('/fcm-token', deviceController.registerFcmToken);

// Validar código de desbloqueo
router.post('/validate-unlock', deviceController.validateUnlock);

router.get('/device/by-imei', deviceController.getDeviceByImei);

module.exports = router;
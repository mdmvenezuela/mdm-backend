const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');

// Estas rutas son públicas, llamadas por la app Android
router.post('/register', deviceController.registerDevice);
router.post('/location', deviceController.updateLocation);
router.get('/commands', deviceController.getCommands);
router.post('/heartbeat', deviceController.heartbeat);

module.exports = router;
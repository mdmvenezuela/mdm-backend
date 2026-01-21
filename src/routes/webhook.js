const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Endpoint para Pub/Sub (sin autenticación JWT)
router.post('/pubsub', webhookController.handlePubSubNotification);

module.exports = router;
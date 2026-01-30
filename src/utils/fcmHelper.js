// ===================================================
// FCM HELPER - Firebase Cloud Messaging
// Maneja el envío de notificaciones push a dispositivos
// ===================================================

const admin = require('firebase-admin');
const pool = require('../config/database');

// ===================================================
// INICIALIZAR FIREBASE ADMIN
// ===================================================

let firebaseInitialized = false;

function initializeFirebase() {
  if (firebaseInitialized) {
    return;
  }

  try {
    // Opción 1: Usar Service Account desde variable de entorno (JSON completo)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin inicializado desde SERVICE_ACCOUNT');
    }
    // Opción 2: Usar archivo local (desarrollo)
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
      console.log('✅ Firebase Admin inicializado desde archivo local');
    }
    // Opción 3: Base64 del service account
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      const serviceAccountJson = Buffer.from(
        process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
        'base64'
      ).toString('utf8');
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✅ Firebase Admin inicializado desde BASE64');
    }
    else {
      console.warn('⚠️  No se encontró configuración de Firebase. FCM deshabilitado.');
      return;
    }

    firebaseInitialized = true;
  } catch (error) {
    console.error('❌ Error inicializando Firebase:', error.message);
  }
}

// Inicializar al cargar el módulo
initializeFirebase();

// ===================================================
// FUNCIONES DE FCM
// ===================================================

/**
 * Enviar notificación push a un dispositivo
 * @param {number} deviceId - ID del dispositivo en la BD
 * @param {object} notification - Objeto con title, body, data
 * @returns {Promise<object>} Resultado del envío
 */
async function sendPushNotification(deviceId, notification) {
  if (!firebaseInitialized) {
    console.warn('⚠️  Firebase no inicializado. No se puede enviar notificación.');
    return { success: false, error: 'Firebase no inicializado' };
  }

  try {
    // Obtener el token FCM del dispositivo
    const tokenResult = await pool.query(
      'SELECT fcm_token FROM device_fcm_tokens WHERE device_id = $1',
      [deviceId]
    );

    if (tokenResult.rows.length === 0) {
      console.warn(`⚠️  No hay token FCM para dispositivo ${deviceId}`);
      return { success: false, error: 'No FCM token found' };
    }

    const fcmToken = tokenResult.rows[0].fcm_token;

    // Construir el mensaje
    const message = {
      token: fcmToken,
      notification: {
        title: notification.title || 'MDM Notification',
        body: notification.body || ''
      },
      data: notification.data || {},
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'mdm_commands'
        }
      }
    };

    // Enviar la notificación
    const response = await admin.messaging().send(message);

    // Guardar log
    await pool.query(`
      INSERT INTO push_notifications_log 
      (device_id, notification_type, payload, status)
      VALUES ($1, $2, $3, 'SENT')
    `, [
      deviceId,
      notification.type || 'GENERIC',
      JSON.stringify(notification)
    ]);

    console.log(`✅ Notificación enviada a dispositivo ${deviceId}:`, response);
    return { success: true, messageId: response };

  } catch (error) {
    console.error(`❌ Error enviando notificación a dispositivo ${deviceId}:`, error);

    // Guardar log de error
    await pool.query(`
      INSERT INTO push_notifications_log 
      (device_id, notification_type, payload, status, error_message)
      VALUES ($1, $2, $3, 'FAILED', $4)
    `, [
      deviceId,
      notification.type || 'GENERIC',
      JSON.stringify(notification),
      error.message
    ]);

    // Si el token es inválido, eliminarlo de la BD
    if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
      await pool.query(
        'DELETE FROM device_fcm_tokens WHERE device_id = $1',
        [deviceId]
      );
      console.log(`🗑️  Token FCM inválido eliminado para dispositivo ${deviceId}`);
    }

    return { success: false, error: error.message };
  }
}

/**
 * Enviar comando de bloqueo vía FCM
 * @param {number} deviceId - ID del dispositivo
 * @param {string} message - Mensaje a mostrar en pantalla de bloqueo
 * @returns {Promise<object>}
 */
async function sendLockCommand(deviceId, message) {
  return await sendPushNotification(deviceId, {
    type: 'LOCK',
    title: 'Dispositivo Bloqueado',
    body: 'Tu dispositivo ha sido bloqueado remotamente',
    data: {
      command: 'LOCK',
      message: message || 'Contacte al proveedor',
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Enviar comando de desbloqueo vía FCM
 * @param {number} deviceId - ID del dispositivo
 * @param {string} unlockCode - Código de desbloqueo generado
 * @returns {Promise<object>}
 */
async function sendUnlockCommand(deviceId, unlockCode) {
  return await sendPushNotification(deviceId, {
    type: 'UNLOCK',
    title: 'Código de Desbloqueo',
    body: 'Se ha generado un código de desbloqueo',
    data: {
      command: 'UNLOCK',
      unlock_code: unlockCode,
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Solicitar ubicación del dispositivo vía FCM
 * @param {number} deviceId - ID del dispositivo
 * @returns {Promise<object>}
 */
async function requestLocation(deviceId) {
  return await sendPushNotification(deviceId, {
    type: 'REQUEST_LOCATION',
    title: 'Solicitud de Ubicación',
    body: 'Se solicita tu ubicación actual',
    data: {
      command: 'REQUEST_LOCATION',
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Enviar comando de reinicio vía FCM
 * @param {number} deviceId - ID del dispositivo
 * @returns {Promise<object>}
 */
async function sendRebootCommand(deviceId) {
  return await sendPushNotification(deviceId, {
    type: 'REBOOT',
    title: 'Reinicio Solicitado',
    body: 'El dispositivo se reiniciará',
    data: {
      command: 'REBOOT',
      timestamp: new Date().toISOString()
    }
  });
}

// ===================================================
// EXPORTAR FUNCIONES
// ===================================================

module.exports = {
  sendPushNotification,
  sendLockCommand,
  sendUnlockCommand,
  requestLocation,
  sendRebootCommand,
  isFirebaseInitialized: () => firebaseInitialized
};
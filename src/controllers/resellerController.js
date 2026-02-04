// ===================================================
// RESELLER CONTROLLER - VERSIÓN CON FCM Y CÓDIGOS ÚNICOS
// Mantiene Android Enterprise para enrollment
// Usa FCM para comandos de bloqueo/desbloqueo
// Archivo: controllers/resellerController.js
// ===================================================

const pool = require('../config/database');
const { createEnrollmentToken } = require('../utils/androidManagement');
const QRCode = require('qrcode');
const crypto = require("crypto");
const { google } = require('googleapis');
const { sendLockCommand, sendUnlockCommand, requestLocation, sendRebootCommand } = require('../utils/fcmHelper');
const { createUnlockCode, getActiveUnlockCode } = require('../utils/unlockCodesHelper');

// ===================================================
// HELPER: Cliente de Android Management
// ===================================================
async function getAndroidManagementClient() {
  const credentialsJson = Buffer.from(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 
    'base64'
  ).toString('utf8');
  
  const credentials = JSON.parse(credentialsJson);
  
  const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ['https://www.googleapis.com/auth/androidmanagement'],
  });

  return google.androidmanagement({
    version: 'v1',
    auth: auth,
  });
}

// ===================================================
// Dashboard del Reseller
// ===================================================
exports.getDashboard = async (req, res) => {
  try {
    const resellerId = req.user.id;

    const resellerInfo = await pool.query(
      'SELECT * FROM resellers WHERE id = $1',
      [resellerId]
    );

    const licensesStats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'DISPONIBLE') as disponibles,
        COUNT(*) FILTER (WHERE status = 'EN_USO') as en_uso,
        COUNT(*) FILTER (WHERE status = 'VINCULADA') as vinculadas
      FROM licenses
      WHERE reseller_id = $1
    `, [resellerId]);

    const devicesStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'ACTIVO') as activos,
        COUNT(*) FILTER (WHERE status = 'BLOQUEADO') as bloqueados
      FROM devices
      WHERE reseller_id = $1
    `, [resellerId]);

    res.json({
      reseller: resellerInfo.rows[0],
      licenses: licensesStats.rows[0],
      devices: devicesStats.rows[0]
    });
  } catch (error) {
    console.error('Error obteniendo dashboard reseller:', error);
    res.status(500).json({ error: 'Error obteniendo dashboard' });
  }
};

// ===================================================
// ✨ NUEVO: Generar QR con descarga directa de APK (DEVICE OWNER)
// ===================================================
exports.generateEnrollmentQR = async (req, res) => {
  const client = await pool.connect();
    try {
        /**
         * 🔐 CONFIGURACIÓN BASE (AJUSTA SOLO ESTOS VALORES)
         */
      await client.query('BEGIN');
        const APK_DOWNLOAD_URL = "https://www.solvenca.lat/mdm-device-manager-v2.apk";
        const PACKAGE_NAME = "com.solvenca.mdm";
        const ADMIN_COMPONENT = "com.solvenca.mdm/.receivers.DeviceAdminReceiver";
        const resellerId = req.user.id;

        // Verificar licencias disponibles
    const availableLicense = await client.query(`
      SELECT * FROM licenses 
      WHERE reseller_id = $1 AND status = 'DISPONIBLE'
      LIMIT 1
    `, [resellerId]);

    if (availableLicense.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No hay licencias disponibles' });
    }

    const license = availableLicense.rows[0];
    
    // Generar token único
    const token = `ET_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await client.query(`
      INSERT INTO enrollment_tokens (token, reseller_id, license_id, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [token, resellerId, license.id, expiresAt]);

    await client.query('COMMIT');

        /**
         * ⚠️ SHA256 DEL APK (OBLIGATORIO)
         * Este valor DEBE coincidir con el APK firmado
         */
        const APK_SIGNATURE_SHA256 = "7lJQhhoNj_DuYQwfw58g5wPGOej9YMFlW5iAlH3E6Gk";

        /**
         * 📦 PAYLOAD OFICIAL ANDROID ENTERPRISE
         */
        const provisioningPayload = {
            "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": ADMIN_COMPONENT,

            "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION":
                APK_DOWNLOAD_URL,

            "android.app.extra.PROVISIONING_DEVICE_ADMIN_SIGNATURE_CHECKSUM":
                APK_SIGNATURE_SHA256,

            "android.app.extra.PROVISIONING_MODE":
                "android.app.extra.PROVISIONING_MODE_FULLY_MANAGED_DEVICE",

            "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": false,

            "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
            "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
        "enrollment_token": token,
        "reseller_id": resellerId.toString(),
        "license_id": license.id.toString()
      },
            "expires_at": expiresAt
        };

        /**
         * 🔄 CONVERTIMOS A STRING (ANDROID REQUIERE JSON PLANO)
         */
        const qrPayloadString = JSON.stringify(provisioningPayload);

        /**
         * 🧾 GENERAMOS QR BASE64 (IDEAL PARA FRONTEND)
         */
        const qrCodeBase64 = await QRCode.toDataURL(qrPayloadString, {
            errorCorrectionLevel: "M",
            margin: 2,
            width: 350
        });

        /**
         * 📤 RESPUESTA
         */
        return res.status(200).json({
            success: true,
            qr: qrCodeBase64,
            payload: provisioningPayload
        });

    } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Error generando QR MDMSMART:", error);
    return res.status(500).json({
        success: false,
        message: "Error generando QR de enrolamiento"
    });
} finally {
    client.release();
}
};


// ===================================================
// Obtener dispositivos del reseller (SIN CAMBIOS)
// ===================================================
exports.getDevices = async (req, res) => {
  try {
    const resellerId = req.user.id;

    const result = await pool.query(`
      SELECT 
        d.*,
        l.license_key,
        l.status as license_status
      FROM devices d
      LEFT JOIN licenses l ON d.license_id = l.id
      WHERE d.reseller_id = $1
      ORDER BY d.enrolled_at DESC
    `, [resellerId]);

    res.json({ devices: result.rows });
  } catch (error) {
    console.error('Error obteniendo dispositivos:', error);
    res.status(500).json({ error: 'Error obteniendo dispositivos' });
  }
};

// ===================================================
// MODIFICADO: Obtener detalle del dispositivo
// Ahora incluye código de desbloqueo activo
// ===================================================
exports.getDeviceDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const resellerId = req.user.id;

    const result = await pool.query(`
      SELECT 
        d.*,
        l.license_key,
        l.status as license_status
      FROM devices d
      LEFT JOIN licenses l ON d.license_id = l.id
      WHERE d.id = $1 AND d.reseller_id = $2
    `, [id, resellerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const device = result.rows[0];

    // ✅ NUEVO: Obtener código de desbloqueo activo si existe
    const activeCode = await getActiveUnlockCode(id);
    if (activeCode) {
      device.active_unlock_code = {
        code: activeCode.code,
        expires_at: activeCode.expires_at,
        created_at: activeCode.created_at
      };
    }

    // Verificar si tiene token FCM registrado
    const fcmToken = await pool.query(
      'SELECT fcm_token FROM device_fcm_tokens WHERE device_id = $1',
      [id]
    );
    device.has_fcm_token = fcmToken.rows.length > 0;

    // Si tiene google_device_name, obtener info de Android Enterprise
    if (device.google_device_name) {
      try {
        const androidManagement = await getAndroidManagementClient();
        
        const deviceInfo = await androidManagement.enterprises.devices.get({
          name: device.google_device_name
        });

        device.google_info = {
          state: deviceInfo.data.state,
          appliedState: deviceInfo.data.appliedState,
          lastStatusReportTime: deviceInfo.data.lastStatusReportTime,
          lastPolicySyncTime: deviceInfo.data.lastPolicySyncTime,
          policyName: deviceInfo.data.policyName,
          enrollmentTime: deviceInfo.data.enrollmentTime,
          hardwareInfo: deviceInfo.data.hardwareInfo,
          softwareInfo: deviceInfo.data.softwareInfo,
        };

        // Actualizar ubicación si está disponible
        const displays = deviceInfo.data.displays;
        if (displays && displays.length > 0 && displays[0].location) {
          const location = displays[0].location;
          
          await pool.query(`
            UPDATE devices 
            SET last_location_lat = $1, 
                last_location_lon = $2,
                last_location_accuracy = $3,
                last_location_time = NOW()
            WHERE id = $4
          `, [location.latitude, location.longitude, location.accuracy, device.id]);
          
          device.last_location_lat = location.latitude;
          device.last_location_lon = location.longitude;
          device.last_location_accuracy = location.accuracy;
        }

      } catch (error) {
        console.error('Error obteniendo info de Google:', error);
        device.google_info = { error: error.message };
      }
    }

    // Obtener lugar frecuente más probable
    const frequentPlace = await pool.query(`
      SELECT * FROM device_frequent_places
      WHERE device_id = $1
      ORDER BY confidence_score DESC, visit_count DESC
      LIMIT 1
    `, [device.id]);

    if (frequentPlace.rows.length > 0) {
      device.probable_location = frequentPlace.rows[0];
    }

    res.json({ device });
  } catch (error) {
    console.error('Error obteniendo dispositivo:', error);
    res.status(500).json({ error: 'Error obteniendo dispositivo' });
  }
};

// ===================================================
// Actualizar información del cliente (SIN CAMBIOS)
// ===================================================
exports.updateClientInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const { client_name, client_phone } = req.body;
    const resellerId = req.user.id;

    const deviceCheck = await pool.query(
      'SELECT id FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    await pool.query(`
      UPDATE devices 
      SET client_name = $1, client_phone = $2
      WHERE id = $3
    `, [client_name, client_phone, id]);

    res.json({
      message: 'Información del cliente actualizada',
      client_name,
      client_phone
    });

  } catch (error) {
    console.error('Error actualizando cliente:', error);
    res.status(500).json({ error: 'Error actualizando información del cliente' });
  }
};

// ===================================================
// MODIFICADO: Solicitar ubicación en tiempo real
// Ahora usa FCM además de Android Management
// ===================================================
exports.requestDeviceLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const resellerId = req.user.id;

    const deviceResult = await pool.query(
      'SELECT * FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const device = deviceResult.rows[0];

    // ✅ NUEVO: Intentar con FCM primero (más rápido)
    const fcmResult = await requestLocation(id);
    
    if (fcmResult.success) {
      return res.json({
        message: 'Solicitud de ubicación enviada vía FCM',
        device_id: id,
        method: 'FCM'
      });
    }

    // Si FCM falla, usar Android Management API como fallback
    if (!device.google_device_name) {
      return res.status(400).json({ error: 'Dispositivo no tiene FCM ni Android Enterprise' });
    }

    const androidManagement = await getAndroidManagementClient();
    
    console.log('📍 Solicitando ubicación vía Android Enterprise:', device.google_device_name);
    
    await androidManagement.enterprises.devices.issueCommand({
      name: device.google_device_name,
      requestBody: {
        type: 'GET_DEVICE_STATE'
      }
    });

    res.json({
      message: 'Ubicación solicitada vía Android Enterprise',
      device_id: id,
      method: 'Android Enterprise'
    });

  } catch (error) {
    console.error('Error solicitando ubicación:', error);
    res.status(500).json({ 
      error: 'Error solicitando ubicación del dispositivo',
      details: error.message 
    });
  }
};

// ===================================================
// ✨ NUEVO: Bloquear dispositivo con FCM y código único
// ===================================================
exports.lockDevice = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const resellerId = req.user.id;
    const { message } = req.body;

    await client.query('BEGIN');

    const deviceResult = await client.query(
      'SELECT * FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const device = deviceResult.rows[0];

    const resellerInfo = await client.query(
      'SELECT business_name, phone, email FROM resellers WHERE id = $1',
      [resellerId]
    );

    const reseller = resellerInfo.rows[0];

    const lockMessage = message || `
╔════════════════════════════════╗
║   DISPOSITIVO BLOQUEADO        ║
╚════════════════════════════════╝

⚠️ RAZÓN DEL BLOQUEO:
Pago pendiente o mora en cuota

📞 CONTACTO PARA DESBLOQUEAR:
${reseller.business_name || 'Tu proveedor'}
Teléfono: ${reseller.phone || 'Contacta a tu vendedor'}
Email: ${reseller.email || ''}

💳 REALIZA TU PAGO Y COMUNÍCATE
Para desbloquear tu dispositivo de inmediato
    `.trim();

    // ✅ NUEVO: Enviar comando de bloqueo vía FCM
    const fcmResult = await sendLockCommand(id, lockMessage);
    
    console.log('🔒 Bloqueando dispositivo vía FCM:', fcmResult.success ? 'OK' : 'FAILED');

    // Actualizar estado en BD
    await client.query(
      'UPDATE devices SET status = $1, lock_message = $2 WHERE id = $3',
      ['BLOQUEADO', lockMessage, id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Dispositivo bloqueado exitosamente',
      device_id: id,
      lock_message: lockMessage,
      fcm_sent: fcmResult.success
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error bloqueando dispositivo:', error);
    res.status(500).json({ 
      error: 'Error bloqueando dispositivo',
      details: error.message 
    });
  } finally {
    client.release();
  }
};

// ===================================================
// ✨ NUEVO: Desbloquear dispositivo con código único
// ===================================================
exports.unlockDevice = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const resellerId = req.user.id;

    await client.query('BEGIN');

    const deviceResult = await client.query(
      'SELECT * FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const device = deviceResult.rows[0];

    // ✅ NUEVO: Generar código único de desbloqueo
    const unlockCode = await createUnlockCode(id, resellerId, 24); // Expira en 24 horas

    console.log(`🔓 Código de desbloqueo generado: ${unlockCode}`);

    // ✅ NUEVO: Enviar notificación FCM con el código
    const fcmResult = await sendUnlockCommand(id, unlockCode);
    
    console.log('📨 Notificación FCM enviada:', fcmResult.success ? 'OK' : 'FAILED');

    // Actualizar estado en BD (pero NO desbloquear aún)
    // Se desbloqueará cuando la app valide el código
    await client.query(
      'UPDATE devices SET lock_message = NULL WHERE id = $1',
      [id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Código de desbloqueo generado exitosamente',
      device_id: id,
      unlock_code: unlockCode,
      client_name: device.client_name,
      client_phone: device.client_phone,
      fcm_sent: fcmResult.success,
      expires_in_hours: 24
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error desbloqueando dispositivo:', error);
    res.status(500).json({ 
      error: 'Error generando código de desbloqueo',
      details: error.message 
    });
  } finally {
    client.release();
  }
};

// ===================================================
// MODIFICADO: Reiniciar dispositivo con FCM
// ===================================================
exports.rebootDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const resellerId = req.user.id;

    const deviceResult = await pool.query(
      'SELECT * FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    // ✅ NUEVO: Enviar comando vía FCM
    const fcmResult = await sendRebootCommand(id);

    res.json({
      message: 'Comando de reinicio enviado',
      device_id: id,
      fcm_sent: fcmResult.success
    });
  } catch (error) {
    console.error('Error reiniciando dispositivo:', error);
    res.status(500).json({ 
      error: 'Error reiniciando dispositivo',
      details: error.message 
    });
  }
};

// ===================================================
// Cambiar política (SIN CAMBIOS)
// ===================================================
exports.changeDevicePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    const { policyName } = req.body;
    const resellerId = req.user.id;

    if (!policyName) {
      return res.status(400).json({ error: 'Policy name es requerido' });
    }

    const deviceResult = await pool.query(
      'SELECT * FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const device = deviceResult.rows[0];

    if (!device.google_device_name) {
      return res.status(400).json({ error: 'Dispositivo no enrollado en Android Enterprise' });
    }

    const androidManagement = await getAndroidManagementClient();
    
    console.log('🛡️ Cambiando política:', device.google_device_name, '->', policyName);
    
    await androidManagement.enterprises.devices.patch({
      name: device.google_device_name,
      updateMask: 'policyName',
      requestBody: {
        policyName: policyName
      }
    });

    res.json({
      message: 'Política cambiada exitosamente',
      device_id: id,
      new_policy: policyName
    });
  } catch (error) {
    console.error('Error cambiando política:', error);
    res.status(500).json({ 
      error: 'Error cambiando política',
      details: error.message 
    });
  }
};

// Liberar dispositivo, historial, lugares frecuentes, políticas (SIN CAMBIOS)
exports.releaseDevice = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const resellerId = req.user.id;
    
    await client.query('BEGIN');
    
    const deviceResult = await client.query(
      'SELECT * FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );
    
    if (deviceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }
    
    const device = deviceResult.rows[0];
    let removedFromEnterprise = false;
    
    // ✅ Eliminar dispositivo de Android Management API
    if (device.google_device_name) {
      try {
        const androidManagement = await getAndroidManagementClient();
        
        console.log('🗑️ Eliminando dispositivo de Android Management:', device.google_device_name);
        
        await androidManagement.enterprises.devices.delete({
          name: device.google_device_name
        });
        
        console.log('✅ Dispositivo eliminado de Android Management API');
        removedFromEnterprise = true;
        
      } catch (error) {
        console.error('⚠️ Error eliminando de Android Management:', error.message);
        // Continuar aunque falle
      }
    }
    
    // Actualizar licencia a VINCULADA
    await client.query(`
      UPDATE licenses 
      SET status = 'VINCULADA', device_imei = $1
      WHERE id = $2
    `, [device.imei, device.license_id]);
    
    // Actualizar dispositivo a LIBERADO y limpiar google_device_name
    await client.query(
      'UPDATE devices SET status = $1, google_device_name = NULL WHERE id = $2',
      ['LIBERADO', id]
    );
    
    // Limpiar token FCM
    await client.query(
      'DELETE FROM device_fcm_tokens WHERE device_id = $1',
      [id]
    );
    
    await client.query('COMMIT');
    
    res.json({
      message: 'Dispositivo liberado exitosamente y eliminado de Android Management',
      device_id: id,
      imei: device.imei,
      removed_from_enterprise: removedFromEnterprise  // ✅ Ahora correcto
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error liberando dispositivo:', error);
    res.status(500).json({ error: 'Error liberando dispositivo' });
  } finally {
    client.release();
  }
};


exports.getDeviceLocationHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, days = 7 } = req.query;
    const resellerId = req.user.id;

    const deviceCheck = await pool.query(
      'SELECT id FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const history = await pool.query(`
      SELECT 
        latitude, 
        longitude, 
        accuracy, 
        battery_level, 
        recorded_at
      FROM device_locations
      WHERE device_id = $1 
        AND recorded_at >= NOW() - INTERVAL '${days} days'
      ORDER BY recorded_at DESC
      LIMIT $2
    `, [id, limit]);

    res.json({
      device_id: id,
      total: history.rows.length,
      history: history.rows
    });

  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ error: 'Error obteniendo historial de ubicaciones' });
  }
};

exports.getDeviceFrequentPlaces = async (req, res) => {
  try {
    const { id } = req.params;
    const resellerId = req.user.id;

    const deviceCheck = await pool.query(
      'SELECT id, client_name FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const device = deviceCheck.rows[0];

    const places = await pool.query(`
      SELECT 
        id,
        place_type,
        latitude,
        longitude,
        visit_count,
        total_time_minutes,
        confidence_score,
        first_seen,
        last_seen
      FROM device_frequent_places
      WHERE device_id = $1
      ORDER BY confidence_score DESC, visit_count DESC
    `, [id]);

    res.json({
      device_id: id,
      client_name: device.client_name,
      places: places.rows
    });

  } catch (error) {
    console.error('Error obteniendo lugares frecuentes:', error);
    res.status(500).json({ error: 'Error obteniendo lugares frecuentes' });
  }
};

exports.getAvailablePolicies = async (req, res) => {
  try {
    const androidManagement = await getAndroidManagementClient();
    const enterpriseName = process.env.ANDROID_ENTERPRISE_NAME;

    if (!enterpriseName) {
      return res.status(500).json({ error: 'ANDROID_ENTERPRISE_NAME no configurado' });
    }

    const response = await androidManagement.enterprises.policies.list({
      parent: enterpriseName
    });

    const policies = response.data.policies || [];

    const formattedPolicies = policies.map(policy => {
      const policyNameParts = policy.name.split('/');
      const policyId = policyNameParts[policyNameParts.length - 1];
      
      return {
        id: policyId,
        name: policyId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        fullName: policy.name,
        version: policy.version
      };
    });

    res.json({ policies: formattedPolicies });
  } catch (error) {
    console.error('Error listando políticas:', error);
    res.status(500).json({ 
      error: 'Error obteniendo políticas',
      details: error.message 
    });
  }
};

exports.getDeviceLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const resellerId = req.user.id;

    const deviceResult = await pool.query(
      'SELECT * FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const device = deviceResult.rows[0];

    if (!device.google_device_name) {
      return res.status(400).json({ error: 'Dispositivo no enrollado en Android Enterprise' });
    }

    const androidManagement = await getAndroidManagementClient();
    
    const deviceInfo = await androidManagement.enterprises.devices.get({
      name: device.google_device_name
    });

    res.json({
      device_id: id,
      google_device_name: device.google_device_name,
      last_status_report: deviceInfo.data.lastStatusReportTime,
      state: deviceInfo.data.state,
      hardware_info: deviceInfo.data.hardwareInfo,
      software_info: deviceInfo.data.softwareInfo,
      network_info: deviceInfo.data.networkInfo,
      memory_info: deviceInfo.data.memoryInfo,
      displays: deviceInfo.data.displays
    });
  } catch (error) {
    console.error('Error obteniendo información:', error);
    res.status(500).json({ 
      error: 'Error obteniendo información del dispositivo',
      details: error.message 
    });
  }
};
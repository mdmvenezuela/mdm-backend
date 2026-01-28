// ===================================================
// RESELLER CONTROLLER - VERSIÓN CON UBICACIÓN Y EDICIÓN
// Incluye: tracking de ubicación, lugares frecuentes, edición de cliente
// Archivo: controllers/resellerController.js
// ===================================================

const pool = require('../config/database');
const { createEnrollmentToken } = require('../utils/androidManagement');
const QRCode = require('qrcode');
const { google } = require('googleapis');

// Helper para Android Management
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

// Dashboard del Reseller
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

// Generar QR de enrollment
exports.generateEnrollmentQR = async (req, res) => {
  const client = await pool.connect();
  try {
    const resellerId = req.user.id;
    await client.query('BEGIN');

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
    
    const enrollmentData = await createEnrollmentToken();
    
    const token = enrollmentData.value;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await client.query(`
      INSERT INTO enrollment_tokens (token, reseller_id, license_id, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [token, resellerId, license.id, expiresAt]);

    await client.query('COMMIT');

    const qrContent = enrollmentData.qrCode;
    const qrImageBase64 = await QRCode.toDataURL(qrContent, {
      errorCorrectionLevel: 'L',
      type: 'image/png',
      width: 512,
      margin: 1
    });

    res.json({
      message: 'QR generado exitosamente con Android Enterprise',
      token: token,
      qr_code: qrImageBase64,
      expires_at: expiresAt,
      license_key: license.license_key,
      enrollment_url: `https://enterprise.google.com/android/enroll?et=${token}`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error generando QR:', error);
    res.status(500).json({ 
      error: 'Error generando QR de enrolamiento',
      details: error.message 
    });
  } finally {
    client.release();
  }
};

// Obtener dispositivos del reseller
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
// NUEVO: Obtener detalle completo de dispositivo CON ubicación actualizada
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

    // Obtener información actualizada de Android Enterprise
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
          applicationReports: deviceInfo.data.applicationReports,
          memoryInfo: deviceInfo.data.memoryInfo,
          networkInfo: deviceInfo.data.networkInfo,
          powerManagementEvents: deviceInfo.data.powerManagementEvents,
          user: deviceInfo.data.user,
          userName: deviceInfo.data.userName,
        };

        // Actualizar ubicación si está disponible en los eventos
        const displays = deviceInfo.data.displays;
        if (displays && displays.length > 0 && displays[0].location) {
          const location = displays[0].location;
          await updateDeviceLocation(device.id, location.latitude, location.longitude);
          device.last_location_lat = location.latitude;
          device.last_location_lon = location.longitude;
        }

      } catch (error) {
        console.error('Error obteniendo info de Google:', error);
        device.google_info = { error: error.message };
      }
    }

    // Obtener lugar frecuente más probable (casa)
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
// NUEVO: Actualizar información del cliente
// ===================================================
exports.updateClientInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const { client_name, client_phone } = req.body;
    const resellerId = req.user.id;

    // Verificar que el dispositivo pertenece al reseller
    const deviceCheck = await pool.query(
      'SELECT id FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    // Actualizar información
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
// NUEVO: Solicitar ubicación actualizada del dispositivo
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

    if (!device.google_device_name) {
      return res.status(400).json({ error: 'Dispositivo no enrollado en Android Enterprise' });
    }

    // Solicitar reporte de estado a Android Enterprise
    const androidManagement = await getAndroidManagementClient();
    
    await androidManagement.enterprises.devices.issueCommand({
      name: device.google_device_name,
      requestBody: {
        type: 'GET_DEVICE_STATE'
      }
    });

    // Obtener info actualizada
    const deviceInfo = await androidManagement.enterprises.devices.get({
      name: device.google_device_name
    });

    let location = null;
    
    // Intentar obtener ubicación de displays
    if (deviceInfo.data.displays && deviceInfo.data.displays.length > 0) {
      const display = deviceInfo.data.displays[0];
      if (display.location) {
        location = {
          latitude: display.location.latitude,
          longitude: display.location.longitude
        };
        
        // Guardar en BD
        await updateDeviceLocation(device.id, location.latitude, location.longitude);
      }
    }

    res.json({
      message: 'Ubicación solicitada',
      device_id: id,
      location: location,
      last_status_time: deviceInfo.data.lastStatusReportTime
    });

  } catch (error) {
    console.error('Error solicitando ubicación:', error);
    res.status(500).json({ 
      error: 'Error solicitando ubicación del dispositivo',
      details: error.message 
    });
  }
};

// Helper para actualizar ubicación del dispositivo
async function updateDeviceLocation(deviceId, latitude, longitude, accuracy = null, batteryLevel = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Actualizar ubicación actual en devices
    await client.query(`
      UPDATE devices 
      SET last_location_lat = $1, 
          last_location_lon = $2, 
          last_location_accuracy = $3,
          last_location_time = NOW(),
          battery_level = $4,
          last_connection = NOW()
      WHERE id = $5
    `, [latitude, longitude, accuracy, batteryLevel, deviceId]);

    // Guardar en historial
    await client.query(`
      INSERT INTO device_locations 
      (device_id, latitude, longitude, accuracy, battery_level, recorded_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [deviceId, latitude, longitude, accuracy, batteryLevel]);

    // Detectar y actualizar lugares frecuentes
    await detectFrequentPlace(client, deviceId, latitude, longitude);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error guardando ubicación:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Detectar lugares frecuentes
async function detectFrequentPlace(client, deviceId, latitude, longitude) {
  const RADIUS_THRESHOLD = 100; // 100 metros

  // Buscar lugares frecuentes cercanos
  const nearbyPlaces = await client.query(`
    SELECT *, 
      calculate_distance(latitude, longitude, $2, $3) as distance
    FROM device_frequent_places
    WHERE device_id = $1
    HAVING distance < $4
    ORDER BY distance
    LIMIT 1
  `, [deviceId, latitude, longitude, RADIUS_THRESHOLD]);

  if (nearbyPlaces.rows.length > 0) {
    // Lugar existente - incrementar contador
    const place = nearbyPlaces.rows[0];
    await client.query(`
      UPDATE device_frequent_places
      SET visit_count = visit_count + 1,
          last_seen = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `, [place.id]);
  } else {
    // Nuevo lugar frecuente
    await client.query(`
      INSERT INTO device_frequent_places
      (device_id, latitude, longitude, visit_count, first_seen, last_seen, place_type)
      VALUES ($1, $2, $3, 1, NOW(), NOW(), 'frequent')
    `, [deviceId, latitude, longitude]);
  }

  // Recalcular confianza y tipo de lugares
  await calculatePlaceTypes(client, deviceId);
}

// Calcular tipos de lugares (casa, trabajo)
async function calculatePlaceTypes(client, deviceId) {
  // Obtener todos los lugares ordenados por visitas
  const places = await client.query(`
    SELECT * FROM device_frequent_places
    WHERE device_id = $1
    ORDER BY visit_count DESC, total_time_minutes DESC
  `, [deviceId]);

  if (places.rows.length > 0) {
    // El más visitado es probablemente la casa
    await client.query(`
      UPDATE device_frequent_places
      SET place_type = 'home', confidence_score = 90
      WHERE id = $1
    `, [places.rows[0].id]);
  }

  if (places.rows.length > 1) {
    // El segundo más visitado podría ser el trabajo
    await client.query(`
      UPDATE device_frequent_places
      SET place_type = 'work', confidence_score = 70
      WHERE id = $1
    `, [places.rows[1].id]);
  }
}

// ===================================================
// BLOQUEAR DISPOSITIVO (CORREGIDO)
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
    
    if (!device.google_device_name) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Dispositivo no enrollado en Android Enterprise' });
    }

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

    // IMPORTANTE: Usar google_device_name, NO el id
    const androidManagement = await getAndroidManagementClient();
    
    await androidManagement.enterprises.devices.issueCommand({
      name: device.google_device_name, // ✅ Usar device name completo
      requestBody: {
        type: 'LOCK',
        lockReason: lockMessage
      }
    });

    await client.query(
      'UPDATE devices SET status = $1, lock_message = $2 WHERE id = $3',
      ['BLOQUEADO', lockMessage, id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Dispositivo bloqueado exitosamente',
      device_id: id,
      lock_message: lockMessage
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

// Desbloquear dispositivo
exports.unlockDevice = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const resellerId = req.user.id;
    const { new_password } = req.body;

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

    if (!device.google_device_name) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Dispositivo no enrollado en Android Enterprise' });
    }

    const unlockPassword = new_password || Math.floor(100000 + Math.random() * 900000).toString();

    const androidManagement = await getAndroidManagementClient();
    
    await androidManagement.enterprises.devices.issueCommand({
      name: device.google_device_name,
      requestBody: {
        type: 'RESET_PASSWORD',
        resetPasswordFlags: ['REQUIRE_ENTRY'],
        newPassword: unlockPassword
      }
    });

    await client.query(
      'UPDATE devices SET status = $1, unlock_code = $2, lock_message = NULL WHERE id = $3',
      ['ACTIVO', unlockPassword, id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Dispositivo desbloqueado exitosamente',
      device_id: id,
      unlock_code: unlockPassword,
      client_name: device.client_name,
      client_phone: device.client_phone
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error desbloqueando dispositivo:', error);
    res.status(500).json({ 
      error: 'Error desbloqueando dispositivo',
      details: error.message 
    });
  } finally {
    client.release();
  }
};

// ===================================================
// RESELLER CONTROLLER - PARTE 2
// Agregar al final de resellerController-location.js
// ===================================================

// Reiniciar dispositivo
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

    const device = deviceResult.rows[0];

    if (!device.google_device_name) {
      return res.status(400).json({ error: 'Dispositivo no enrollado en Android Enterprise' });
    }

    const androidManagement = await getAndroidManagementClient();
    
    await androidManagement.enterprises.devices.issueCommand({
      name: device.google_device_name,
      requestBody: {
        type: 'REBOOT'
      }
    });

    res.json({
      message: 'Comando de reinicio enviado exitosamente',
      device_id: id
    });
  } catch (error) {
    console.error('Error reiniciando dispositivo:', error);
    res.status(500).json({ 
      error: 'Error reiniciando dispositivo',
      details: error.message 
    });
  }
};

// Liberar dispositivo
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

    await client.query(`
      UPDATE licenses 
      SET status = 'VINCULADA', device_imei = $1
      WHERE id = $2
    `, [device.imei, device.license_id]);

    await client.query(
      'UPDATE devices SET status = $1 WHERE id = $2',
      ['LIBERADO', id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Dispositivo liberado exitosamente',
      device_id: id,
      imei: device.imei
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error liberando dispositivo:', error);
    res.status(500).json({ error: 'Error liberando dispositivo' });
  } finally {
    client.release();
  }
};

// ===================================================
// NUEVO: Obtener historial de ubicaciones
// ===================================================
exports.getDeviceLocationHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, days = 7 } = req.query;
    const resellerId = req.user.id;

    // Verificar que el dispositivo pertenece al reseller
    const deviceCheck = await pool.query(
      'SELECT id FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    // Obtener historial
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

// ===================================================
// NUEVO: Obtener lugares frecuentes del dispositivo
// ===================================================
exports.getDeviceFrequentPlaces = async (req, res) => {
  try {
    const { id } = req.params;
    const resellerId = req.user.id;

    // Verificar que el dispositivo pertenece al reseller
    const deviceCheck = await pool.query(
      'SELECT id, client_name FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const device = deviceCheck.rows[0];

    // Obtener lugares frecuentes
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

// ===================================================
// NUEVO: Obtener políticas disponibles
// ===================================================
exports.getAvailablePolicies = async (req, res) => {
  try {
    const androidManagement = await getAndroidManagementClient();
    const enterpriseName = process.env.ANDROID_ENTERPRISE_NAME;

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

// ===================================================
// NUEVO: Cambiar política de un dispositivo
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

// Obtener ubicación
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
      memory_info: deviceInfo.data.memoryInfo
    });
  } catch (error) {
    console.error('Error obteniendo información:', error);
    res.status(500).json({ 
      error: 'Error obteniendo información del dispositivo',
      details: error.message 
    });
  }
};
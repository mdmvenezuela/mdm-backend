// ===================================================
// WEBHOOK CONTROLLER - VERSIÓN CON PROCESAMIENTO DE UBICACIÓN
// Reemplazar: controllers/webhookController.js
// ===================================================

const pool = require('../config/database');
const { google } = require('googleapis');

function getGoogleCredentials() {
  const base64Credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
  const jsonCredentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  return JSON.parse(jsonCredentials);
}

async function getAndroidManagementClient() {
  const credentials = getGoogleCredentials();
  
  const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ['https://www.googleapis.com/auth/androidmanagement']
  });

  return google.androidmanagement({
    version: 'v1',
    auth: auth
  });
}

// Handler principal
exports.handlePubSubNotification = async (req, res) => {
  console.log('\n' + '═'.repeat(80));
  console.log('📨 Webhook recibido de Android Enterprise');
  console.log('═'.repeat(80));
  
  try {
    const pubsubMessage = req.body.message;
    
    if (!pubsubMessage || !pubsubMessage.data) {
      console.log('❌ Mensaje Pub/Sub sin data');
      return res.status(200).send('OK');
    }

    const dataString = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
    const notification = JSON.parse(dataString);
    
    console.log('📩 Notificación recibida:');
    console.log(JSON.stringify(notification, null, 2));

    const deviceName = notification.device;
    const userName = notification.user;
    const events = notification.usageLogEvents || [];

    console.log('📱 Device:', deviceName);
    console.log('📋 Events:', events.length);

    // Procesar eventos
    for (const event of events) {
      console.log(`\n🔔 Evento: ${event.eventType}`);
      
      if (event.eventType === 'ENROLLMENT_COMPLETE') {
        await handleEnrollmentComplete(deviceName, userName, event);
      } else if (event.eventType === 'STATUS_REPORT') {
        await handleStatusReport(deviceName, event);
      } else if (event.eventType === 'LOCATION_UPDATE') {
        await handleLocationUpdate(deviceName, event);
      }
    }

    console.log('✅ Webhook procesado');
    console.log('═'.repeat(80) + '\n');
    
    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Error procesando notificación:', error);
    console.error('Stack:', error.stack);
    res.status(200).send('OK');
  }
};

// Handler de enrollment
async function handleEnrollmentComplete(deviceName, userName, event) {
  const client = await pool.connect();
  
  try {
    console.log('\n🆕 === PROCESANDO ENROLLMENT_COMPLETE ===');

    await client.query('BEGIN');

    const androidManagement = await getAndroidManagementClient();
    const deviceInfo = await androidManagement.enterprises.devices.get({
      name: deviceName
    });

    const device = deviceInfo.data;
    
    const imei = device.networkInfo?.imei;
    const serialNumber = device.hardwareInfo?.serialNumber;
    const manufacturer = device.hardwareInfo?.manufacturer;
    const model = device.hardwareInfo?.model;
    const androidVersion = device.softwareInfo?.androidVersion;

    console.log('📊 IMEI:', imei);

    if (!imei) {
      console.error('❌ No se pudo obtener el IMEI');
      await client.query('ROLLBACK');
      return;
    }

    const tokenResult = await client.query(`
      SELECT * FROM enrollment_tokens 
      WHERE is_used = false 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (tokenResult.rows.length === 0) {
      console.error('❌ No hay tokens disponibles');
      await client.query('ROLLBACK');
      return;
    }

    const token = tokenResult.rows[0];
    const licenseId = token.license_id;
    const resellerId = token.reseller_id;

    console.log('✅ Token encontrado - License:', licenseId);

    const existingDevice = await client.query(
      'SELECT * FROM devices WHERE imei = $1 OR google_device_name = $2',
      [imei, deviceName]
    );

    if (existingDevice.rows.length > 0) {
      console.log('⚠️ Dispositivo ya existe, actualizando...');
      
      await client.query(`
        UPDATE devices SET
          google_device_name = $1,
          serial_number = $2,
          manufacturer = $3,
          model = $4,
          android_version = $5,
          status = $6,
          last_connection = NOW()
        WHERE imei = $7
      `, [deviceName, serialNumber, manufacturer, model, androidVersion, 'ACTIVO', imei]);
      
      await client.query('COMMIT');
      return;
    }

    // Insertar nuevo dispositivo
    const insertResult = await client.query(`
    INSERT INTO devices (
      imei,
      manufacturer,
      model,
      android_version,
      reseller_id,
      license_id,
      status,
      enrolled_at,
      last_connection,
      is_online,
      google_device_name,
      serial_number
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), true, $8, $9)
    RETURNING id
  `, [
    imei,
    manufacturer,
    model,
    androidVersion,
    resellerId,
    licenseId,
    'ACTIVO',
    deviceName,
    serialNumber
  ]);

    const deviceId = insertResult.rows[0].id;
    console.log('✅ Dispositivo insertado con ID:', deviceId);

    // Actualizar licencia
    await client.query(`
      UPDATE licenses 
      SET status = $1, device_imei = $2, activated_at = NOW()
      WHERE id = $3
    `, ['EN_USO', imei, licenseId]);
    
    console.log('✅ Licencia actualizada');

    // Marcar token como usado
    await client.query(
      'UPDATE enrollment_tokens SET is_used = true WHERE id = $1',
      [token.id]
    );

    await client.query('COMMIT');
    console.log('🎉 ENROLLMENT COMPLETADO\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en enrollment:', error);
  } finally {
    client.release();
  }
}

// ===================================================
// NUEVO: Handler de actualización de estado (con ubicación)
// ===================================================
async function handleStatusReport(deviceName, event) {
  try {
    console.log('\n📈 === PROCESANDO STATUS_REPORT ===');
    
    // Obtener información actualizada del dispositivo
    const androidManagement = await getAndroidManagementClient();
    const deviceInfo = await androidManagement.enterprises.devices.get({
      name: deviceName
    });

    const device = deviceInfo.data;

    // Buscar dispositivo en BD
    const deviceResult = await pool.query(
      'SELECT id FROM devices WHERE google_device_name = $1',
      [deviceName]
    );

    if (deviceResult.rows.length === 0) {
      console.log('⚠️ Dispositivo no encontrado en BD');
      return;
    }

    const deviceId = deviceResult.rows[0].id;

    // Extraer datos de ubicación y batería
    let batteryLevel = null;
    if (device.powerManagementEvents && device.powerManagementEvents.length > 0) {
      const lastEvent = device.powerManagementEvents[0];
      batteryLevel = lastEvent.batteryLevel;
    }

    // Intentar obtener ubicación
    let latitude = null;
    let longitude = null;
    let accuracy = null;

    if (device.displays && device.displays.length > 0) {
      const display = device.displays[0];
      if (display.location) {
        latitude = display.location.latitude;
        longitude = display.location.longitude;
        accuracy = display.location.accuracy;
      }
    }

    // Actualizar en BD
    if (latitude && longitude) {
      console.log('📍 Ubicación encontrada:', latitude, longitude);
      await updateDeviceLocation(deviceId, latitude, longitude, accuracy, batteryLevel);
    } else {
      // Solo actualizar última conexión y batería
      await pool.query(`
        UPDATE devices 
        SET last_connection = NOW(), 
            battery_level = $1
        WHERE id = $2
      `, [batteryLevel, deviceId]);
    }

    console.log('✅ Status actualizado\n');

  } catch (error) {
    console.error('❌ Error en status report:', error);
  }
}

// ===================================================
// NUEVO: Handler específico de actualización de ubicación
// ===================================================
async function handleLocationUpdate(deviceName, event) {
  try {
    console.log('\n📍 === PROCESANDO LOCATION_UPDATE ===');
    
    // Buscar dispositivo en BD
    const deviceResult = await pool.query(
      'SELECT id FROM devices WHERE google_device_name = $1',
      [deviceName]
    );

    if (deviceResult.rows.length === 0) {
      console.log('⚠️ Dispositivo no encontrado en BD');
      return;
    }

    const deviceId = deviceResult.rows[0].id;

    // Obtener ubicación del evento
    if (event.location) {
      const latitude = event.location.latitude;
      const longitude = event.location.longitude;
      const accuracy = event.location.accuracy;
      
      console.log('📍 Nueva ubicación:', latitude, longitude);
      await updateDeviceLocation(deviceId, latitude, longitude, accuracy);
    }

    console.log('✅ Ubicación actualizada\n');

  } catch (error) {
    console.error('❌ Error en location update:', error);
  }
}

// ===================================================
// Helper para actualizar ubicación
// ===================================================
async function updateDeviceLocation(deviceId, latitude, longitude, accuracy = null, batteryLevel = null) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Actualizar ubicación actual
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

    // Detectar lugares frecuentes
    await detectFrequentPlace(client, deviceId, latitude, longitude);

    await client.query('COMMIT');
    console.log('✅ Ubicación guardada');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error guardando ubicación:', error);
  } finally {
    client.release();
  }
}

// Detectar lugares frecuentes
async function detectFrequentPlace(client, deviceId, latitude, longitude) {
  const RADIUS_THRESHOLD = 100; // metros

  // Buscar si hay un lugar frecuente cercano
  const nearbyPlaces = await client.query(`
    SELECT *, 
      (6371000 * acos(
        cos(radians($2)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians($3)) + 
        sin(radians($2)) * sin(radians(latitude))
      )) AS distance
    FROM device_frequent_places
    WHERE device_id = $1
    HAVING distance < $4
    ORDER BY distance
    LIMIT 1
  `, [deviceId, latitude, longitude, RADIUS_THRESHOLD]);

  if (nearbyPlaces.rows.length > 0) {
    // Lugar existente
    const place = nearbyPlaces.rows[0];
    await client.query(`
      UPDATE device_frequent_places
      SET visit_count = visit_count + 1,
          last_seen = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `, [place.id]);
  } else {
    // Nuevo lugar
    await client.query(`
      INSERT INTO device_frequent_places
      (device_id, latitude, longitude, visit_count, first_seen, last_seen, place_type)
      VALUES ($1, $2, $3, 1, NOW(), NOW(), 'frequent')
    `, [deviceId, latitude, longitude]);
  }

  // Recalcular tipos
  await calculatePlaceTypes(client, deviceId);
}

// Calcular tipos de lugares
async function calculatePlaceTypes(client, deviceId) {
  const places = await client.query(`
    SELECT * FROM device_frequent_places
    WHERE device_id = $1
    ORDER BY visit_count DESC
  `, [deviceId]);

  if (places.rows.length > 0) {
    await client.query(`
      UPDATE device_frequent_places
      SET place_type = 'home', confidence_score = 90
      WHERE id = $1
    `, [places.rows[0].id]);
  }

  if (places.rows.length > 1) {
    await client.query(`
      UPDATE device_frequent_places
      SET place_type = 'work', confidence_score = 70
      WHERE id = $1
    `, [places.rows[1].id]);
  }
}

module.exports = {
  handlePubSubNotification
};
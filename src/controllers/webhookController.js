// ===================================================
// WEBHOOK CONTROLLER CORREGIDO
// Basado en el formato REAL de notificaciones que recibes
// Archivo: controllers/webhookController.js
// ===================================================

const pool = require('../config/database');
const { google } = require('googleapis');

// Helper para obtener credenciales de Google
function getGoogleCredentials() {
  const base64Credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
  const jsonCredentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  return JSON.parse(jsonCredentials);
}

// Helper para obtener cliente de Android Management
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

// ===================================================
// HANDLER PRINCIPAL
// ===================================================
const handlePubSubNotification = async (req, res) => {
  console.log('\n' + '═'.repeat(80));
  console.log('📨 Webhook recibido de Android Enterprise');
  console.log('═'.repeat(80));
  
  try {
    const pubsubMessage = req.body.message;
    
    if (!pubsubMessage || !pubsubMessage.data) {
      console.log('❌ Mensaje Pub/Sub sin data');
      return res.status(200).send('OK'); // Responder 200 siempre
    }

    const dataString = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
    const notification = JSON.parse(dataString);
    
    console.log('📩 Notificación recibida:');
    console.log(JSON.stringify(notification, null, 2));

    // El formato real que recibes es:
    // {
    //   device: 'enterprises/.../devices/...',
    //   user: 'enterprises/.../users/...',
    //   usageLogEvents: [...]
    // }

    const deviceName = notification.device;
    const userName = notification.user;
    const events = notification.usageLogEvents || [];

    console.log('📱 Device:', deviceName);
    console.log('👤 User:', userName);
    console.log('📋 Events:', events.length);

    // Procesar eventos
    for (const event of events) {
      console.log(`\n🔔 Evento: ${event.eventType}`);
      
      if (event.eventType === 'ENROLLMENT_COMPLETE') {
        await handleEnrollmentComplete(deviceName, userName, event);
      } else if (event.eventType === 'COMPLIANCE_REPORT') {
        await handleComplianceReport(deviceName, event);
      } else {
        console.log(`⚠️ Tipo de evento no manejado: ${event.eventType}`);
      }
    }

    console.log('✅ Webhook procesado');
    console.log('═'.repeat(80) + '\n');
    
    res.status(200).send('OK');

  } catch (error) {
    console.error('❌ Error procesando notificación:', error);
    console.error('Stack:', error.stack);
    res.status(200).send('OK'); // Responder 200 siempre para evitar reintentos
  }
};

// ===================================================
// HANDLER DE ENROLLMENT COMPLETE
// ===================================================
async function handleEnrollmentComplete(deviceName, userName, event) {
  const client = await pool.connect();
  
  try {
    console.log('\n🆕 === PROCESANDO ENROLLMENT_COMPLETE ===');
    console.log('📱 Device Name:', deviceName);
    console.log('👤 User Name:', userName);
    console.log('⏰ Event Time:', event.eventTime);

    await client.query('BEGIN');

    // PASO 1: Obtener información completa del dispositivo desde Google
    console.log('\n📡 Obteniendo información del dispositivo desde Google...');
    
    const androidManagement = await getAndroidManagementClient();
    const deviceInfo = await androidManagement.enterprises.devices.get({
      name: deviceName
    });

    const device = deviceInfo.data;
    console.log('✅ Información obtenida');

    // PASO 2: Extraer datos importantes
    const imei = device.networkInfo?.imei;
    const serialNumber = device.hardwareInfo?.serialNumber;
    const manufacturer = device.hardwareInfo?.manufacturer;
    const model = device.hardwareInfo?.model;
    const androidVersion = device.softwareInfo?.androidVersion;
    const policyName = device.policyName;

    console.log('\n📊 Datos del dispositivo:');
    console.log('  IMEI:', imei);
    console.log('  Serial:', serialNumber);
    console.log('  Fabricante:', manufacturer);
    console.log('  Modelo:', model);
    console.log('  Android:', androidVersion);
    console.log('  Política:', policyName);

    if (!imei) {
      console.error('❌ ERROR: No se pudo obtener el IMEI');
      await client.query('ROLLBACK');
      return;
    }

    // PASO 3: Buscar enrollment token más reciente no usado
    // Como la notificación no trae el token, buscamos el más reciente
    console.log('\n🔍 Buscando enrollment token disponible...');
    
    const tokenResult = await client.query(`
      SELECT * FROM enrollment_tokens 
      WHERE is_used = false 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (tokenResult.rows.length === 0) {
      console.error('❌ ERROR: No hay tokens disponibles');
      console.log('💡 Esto puede indicar que:');
      console.log('   1. El dispositivo se enroló con un token antiguo');
      console.log('   2. Necesitas crear el dispositivo manualmente');
      await client.query('ROLLBACK');
      return;
    }

    const token = tokenResult.rows[0];
    const licenseId = token.license_id;
    const resellerId = token.reseller_id;

    console.log('✅ Token encontrado:');
    console.log('  Token:', token.token);
    console.log('  License ID:', licenseId);
    console.log('  Reseller ID:', resellerId);

    // PASO 4: Verificar si el dispositivo ya existe
    console.log('\n🔍 Verificando si el dispositivo ya existe...');
    
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
      
      console.log('✅ Dispositivo actualizado');
      await client.query('COMMIT');
      return;
    }

    // PASO 5: Insertar nuevo dispositivo
    console.log('\n💾 Insertando dispositivo en BD...');
    
    const insertResult = await client.query(`
      INSERT INTO devices (
        google_device_name,
        imei,
        serial_number,
        manufacturer,
        model,
        android_version,
        reseller_id,
        license_id,
        status,
        enrolled_at,
        last_connection,
        is_online
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), true)
      RETURNING id
    `, [
      deviceName,
      imei,
      serialNumber,
      manufacturer,
      model,
      androidVersion,
      resellerId,
      licenseId,
      'ACTIVO'
    ]);

    const deviceId = insertResult.rows[0].id;
    console.log('✅ Dispositivo insertado con ID:', deviceId);

    // PASO 6: Actualizar licencia
    console.log('\n🔄 Actualizando licencia...');
    
    await client.query(`
      UPDATE licenses 
      SET status = $1, device_imei = $2, activated_at = NOW()
      WHERE id = $3
    `, ['EN_USO', imei, licenseId]);
    
    console.log('✅ Licencia actualizada a EN_USO');

    // PASO 7: Marcar token como usado
    console.log('\n🔄 Marcando token como usado...');
    
    await client.query(
      'UPDATE enrollment_tokens SET is_used = true WHERE id = $1',
      [token.id]
    );
    
    console.log('✅ Token marcado como usado');

    await client.query('COMMIT');
    console.log('\n🎉 === ENROLLMENT COMPLETADO EXITOSAMENTE ===\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ === ERROR EN ENROLLMENT ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    console.error('═'.repeat(80) + '\n');
  } finally {
    client.release();
  }
}

// ===================================================
// HANDLER DE COMPLIANCE REPORT
// ===================================================
async function handleComplianceReport(deviceName, event) {
  try {
    console.log('\n📊 === PROCESANDO COMPLIANCE_REPORT ===');
    console.log('📱 Device:', deviceName);
    
    // Actualizar última conexión
    await pool.query(
      'UPDATE devices SET last_connection = NOW() WHERE google_device_name = $1',
      [deviceName]
    );
    
    console.log('✅ Última conexión actualizada\n');

  } catch (error) {
    console.error('❌ Error en compliance report:', error);
  }
}

module.exports = {
  handlePubSubNotification
};
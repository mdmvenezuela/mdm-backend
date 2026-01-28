// ===================================================
// SCRIPT PARA PROCESAR EL DISPOSITIVO YA ENROLLADO
// Simula el webhook con los datos reales que ya tienes
// Archivo: process-enrolled-device.js
// ===================================================

const { google } = require('googleapis');
const pool = require('./src/config/database'); // Ajusta la ruta

console.log('🔄 Procesando dispositivo enrollado manualmente\n');

// Datos del dispositivo que ya está enrollado
const DEVICE_NAME = 'enterprises/LC01l2uql7/devices/37f9c8907ad1cbda';
const IMEI = '354249351041426';

// Helper para obtener credenciales
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

async function processDevice() {
  const client = await pool.connect();
  
  try {
    console.log('📡 Obteniendo información del dispositivo...');
    
    const androidManagement = await getAndroidManagementClient();
    const deviceInfo = await androidManagement.enterprises.devices.get({
      name: DEVICE_NAME
    });

    const device = deviceInfo.data;
    console.log('✅ Información obtenida\n');

    // Extraer datos
    const imei = device.networkInfo?.imei;
    const serialNumber = device.hardwareInfo?.serialNumber;
    const manufacturer = device.hardwareInfo?.manufacturer;
    const model = device.hardwareInfo?.model;
    const androidVersion = device.softwareInfo?.androidVersion;

    console.log('📊 Datos del dispositivo:');
    console.log('  IMEI:', imei);
    console.log('  Serial:', serialNumber);
    console.log('  Fabricante:', manufacturer);
    console.log('  Modelo:', model);
    console.log('  Android:', androidVersion);
    console.log('');

    await client.query('BEGIN');

    // Buscar token más reciente no usado
    console.log('🔍 Buscando token disponible...');
    
    const tokenResult = await client.query(`
      SELECT * FROM enrollment_tokens 
      WHERE is_used = false 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (tokenResult.rows.length === 0) {
      console.error('❌ No hay tokens disponibles');
      console.log('\n💡 Solución: Usa el token más reciente aunque esté usado:');
      
      const lastTokenResult = await client.query(`
        SELECT * FROM enrollment_tokens 
        ORDER BY created_at DESC 
        LIMIT 1
      `);
      
      if (lastTokenResult.rows.length > 0) {
        const lastToken = lastTokenResult.rows[0];
        console.log(`   Token: ${lastToken.token}`);
        console.log(`   License ID: ${lastToken.license_id}`);
        console.log(`   Reseller ID: ${lastToken.reseller_id}`);
        
        // Usar este token de todos modos
        const token = lastToken;
        await insertDevice(client, device, token);
      }
      
      await client.query('ROLLBACK');
      return;
    }

    const token = tokenResult.rows[0];
    console.log('✅ Token encontrado:', token.token);
    console.log('  License ID:', token.license_id);
    console.log('  Reseller ID:', token.reseller_id);
    console.log('');

    // Insertar dispositivo
    await insertDevice(client, device, token);

    await client.query('COMMIT');
    console.log('\n🎉 Dispositivo procesado exitosamente\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

async function insertDevice(client, device, token) {
  const deviceName = device.name;
  const imei = device.networkInfo?.imei;
  const serialNumber = device.hardwareInfo?.serialNumber;
  const manufacturer = device.hardwareInfo?.manufacturer;
  const model = device.hardwareInfo?.model;
  const androidVersion = device.softwareInfo?.androidVersion;
  const licenseId = token.license_id;
  const resellerId = token.reseller_id;

  // Verificar si ya existe
  const existingDevice = await client.query(
    'SELECT * FROM devices WHERE imei = $1 OR google_device_name = $2',
    [imei, deviceName]
  );

  if (existingDevice.rows.length > 0) {
    console.log('⚠️ Dispositivo ya existe en BD');
    return;
  }

  console.log('💾 Insertando dispositivo...');
  
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
  console.log('🔄 Actualizando licencia...');
  
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
  
  console.log('✅ Token marcado como usado');
}

// Ejecutar
processDevice();
const pool = require('../config/database');
const { createEnrollmentToken } = require('../utils/androidManagement');
const QRCode = require('qrcode');
const { google } = require('googleapis');

// Función helper para Android Management
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

    // Información del reseller
    const resellerInfo = await pool.query(
      'SELECT * FROM resellers WHERE id = $1',
      [resellerId]
    );

    // Estadísticas de licencias
    const licensesStats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'DISPONIBLE') as disponibles,
        COUNT(*) FILTER (WHERE status = 'EN_USO') as en_uso,
        COUNT(*) FILTER (WHERE status = 'VINCULADA') as vinculadas
      FROM licenses
      WHERE reseller_id = $1
    `, [resellerId]);

    // Estadísticas de dispositivos
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

// Generar QR de enrollment con Android Enterprise
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
    
    // Crear enrollment token con Android Enterprise API
    const enrollmentData = await createEnrollmentToken();
    
    const token = enrollmentData.value;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await client.query(`
      INSERT INTO enrollment_tokens (token, reseller_id, license_id, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [token, resellerId, license.id, expiresAt]);

    await client.query('COMMIT');

    // Generar imagen QR desde el JSON
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

// Obtener detalle de un dispositivo
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

    // Si tiene google_device_name, obtener info adicional de Google
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
          hardwareInfo: deviceInfo.data.hardwareInfo,
          softwareInfo: deviceInfo.data.softwareInfo,
          memoryInfo: deviceInfo.data.memoryInfo,
          networkInfo: deviceInfo.data.networkInfo,
        };
      } catch (error) {
        console.error('Error obteniendo info de Google:', error);
        device.google_info = null;
      }
    }

    res.json({ device: device });
  } catch (error) {
    console.error('Error obteniendo dispositivo:', error);
    res.status(500).json({ error: 'Error obteniendo dispositivo' });
  }
};

// Bloquear dispositivo usando Android Management API
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

    // Llamar a Android Management API para bloquear
    const androidManagement = await getAndroidManagementClient();
    
    await androidManagement.enterprises.devices.issueCommand({
      name: device.google_device_name,
      requestBody: {
        type: 'LOCK',
        lockReason: message || 'Dispositivo bloqueado por el administrador'
      }
    });

    // Actualizar estado en BD
    await client.query(
      'UPDATE devices SET status = $1 WHERE id = $2',
      ['BLOQUEADO', id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Comando de bloqueo enviado exitosamente',
      device_id: id
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

// Desbloquear dispositivo (limitado por Android Management API)
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

    if (!device.google_device_name) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Dispositivo no enrollado en Android Enterprise' });
    }

    // Android Management API no tiene comando directo para "unlock"
    // Solo podemos cambiar el estado en nuestra BD
    await client.query(
      'UPDATE devices SET status = $1 WHERE id = $2',
      ['ACTIVO', id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Dispositivo marcado como activo en el sistema',
      device_id: id,
      note: 'El usuario debe desbloquear el dispositivo manualmente con su PIN. Android Management API no permite desbloqueo remoto automático por seguridad.'
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

// Resetear dispositivo (Factory Reset remoto)
exports.wipeDevice = async (req, res) => {
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

    if (!device.google_device_name) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Dispositivo no enrollado en Android Enterprise' });
    }

    // Enviar comando de factory reset
    const androidManagement = await getAndroidManagementClient();
    
    await androidManagement.enterprises.devices.issueCommand({
      name: device.google_device_name,
      requestBody: {
        type: 'REBOOT'
      }
    });

    await client.query('COMMIT');

    res.json({
      message: 'Comando de reinicio enviado. Para factory reset completo, elimina el dispositivo desde la consola de Google.',
      device_id: id,
      warning: 'El factory reset remoto eliminará todos los datos del dispositivo'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error reseteando dispositivo:', error);
    res.status(500).json({ 
      error: 'Error reseteando dispositivo',
      details: error.message 
    });
  } finally {
    client.release();
  }
};

// Liberar dispositivo (cliente terminó de pagar)
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

    // Cambiar estado de la licencia a VINCULADA
    await client.query(`
      UPDATE licenses 
      SET status = 'VINCULADA', device_imei = $1
      WHERE id = $2
    `, [device.imei, device.license_id]);

    // Cambiar estado del dispositivo a LIBERADO
    await client.query(
      'UPDATE devices SET status = $1 WHERE id = $2',
      ['LIBERADO', id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Dispositivo liberado exitosamente. La licencia queda vinculada a este IMEI',
      device_id: id,
      imei: device.imei,
      note: 'Esta licencia solo puede reactivarse con el mismo IMEI'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error liberando dispositivo:', error);
    res.status(500).json({ error: 'Error liberando dispositivo' });
  } finally {
    client.release();
  }
};

// Obtener ubicación e información del dispositivo desde Google
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

    // Obtener info del dispositivo desde Google
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
      note: 'La ubicación GPS precisa requiere configuración específica en la política y permisos del dispositivo'
    });
  } catch (error) {
    console.error('Error obteniendo información:', error);
    res.status(500).json({ 
      error: 'Error obteniendo información del dispositivo',
      details: error.message 
    });
  }
};

// Historial de ubicaciones (ahora deprecado - Android Management no guarda historial)
exports.getDeviceLocationHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const resellerId = req.user.id;

    const deviceCheck = await pool.query(
      'SELECT id FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    res.json({ 
      history: [],
      note: 'El historial de ubicaciones no está disponible con Android Management API. Solo se puede obtener el estado actual del dispositivo.'
    });
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ error: 'Error obteniendo historial de ubicaciones' });
  }
};
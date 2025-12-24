const pool = require('../config/database');
const { generateEnrollmentToken, generateQRCode, getAPKChecksum } = require('../utils/helpers');

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
    const token = generateEnrollmentToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await client.query(`
      INSERT INTO enrollment_tokens (token, reseller_id, license_id, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [token, resellerId, license.id, expiresAt]);

    await client.query('COMMIT');

    // ⭐ CONFIGURACIÓN CORRECTA
    const APK_URL = process.env.APK_URL || "https://github.com/mdmvenezuela/mdm-backend/releases/download/v2/mdm.apk";
    const SERVER_URL = process.env.SERVER_URL || "https://mdm-backend-production-bd3f.up.railway.app";
    const APK_CHECKSUM = process.env.APK_CHECKSUM;

    // ⭐ QR SIN PROVISIONING_MODE Y SIN CHECKSUM
    const qrData = {
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.tecnoca.mdm/.DeviceAdminReceiver",
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": APK_URL,
      "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": false,
      "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
      "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
        "enrollment_token": token,
        "server_url": SERVER_URL,  // ⭐ Con https://
        "reseller_id": resellerId
      }
    };

    console.log('✅ QR Data generado:', JSON.stringify(qrData, null, 2));

    const qrCode = await generateQRCode(qrData);

    res.json({
      message: 'QR generado exitosamente',
      token: token,
      qr_code: qrCode,
      expires_at: expiresAt,
      license_key: license.license_key,
      download_url: APK_URL
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error generando QR:', error);
    res.status(500).json({ error: 'Error generando QR de enrolamiento' });
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

    res.json({ device: result.rows[0] });
  } catch (error) {
    console.error('Error obteniendo dispositivo:', error);
    res.status(500).json({ error: 'Error obteniendo dispositivo' });
  }
};

// Bloquear dispositivo
exports.lockDevice = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const resellerId = req.user.id;
    const { message } = req.body;

    await client.query('BEGIN');

    // Verificar que el dispositivo pertenece al reseller
    const deviceCheck = await client.query(
      'SELECT * FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    // Actualizar estado del dispositivo
    await client.query(
      'UPDATE devices SET status = $1 WHERE id = $2',
      ['BLOQUEADO', id]
    );

    // Crear comando pendiente para el dispositivo
    await client.query(`
      INSERT INTO pending_commands (device_id, command_type, command_data)
      VALUES ($1, $2, $3)
    `, [id, 'LOCK', JSON.stringify({ message: message || 'Dispositivo bloqueado por el administrador' })]);

    await client.query('COMMIT');

    res.json({
      message: 'Dispositivo bloqueado exitosamente',
      device_id: id
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error bloqueando dispositivo:', error);
    res.status(500).json({ error: 'Error bloqueando dispositivo' });
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

    await client.query('BEGIN');

    const deviceCheck = await client.query(
      'SELECT * FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    await client.query(
      'UPDATE devices SET status = $1 WHERE id = $2',
      ['ACTIVO', id]
    );

    await client.query(`
      INSERT INTO pending_commands (device_id, command_type, command_data)
      VALUES ($1, $2, $3)
    `, [id, 'UNLOCK', JSON.stringify({})]);

    await client.query('COMMIT');

    res.json({
      message: 'Dispositivo desbloqueado exitosamente',
      device_id: id
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error desbloqueando dispositivo:', error);
    res.status(500).json({ error: 'Error desbloqueando dispositivo' });
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

    // Obtener el dispositivo
    const deviceResult = await client.query(
      'SELECT * FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const device = deviceResult.rows[0];

    // Cambiar estado de la licencia a VINCULADA (queda vinculada al IMEI)
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

// Historial de ubicaciones de un dispositivo
exports.getDeviceLocationHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const resellerId = req.user.id;
    const { days = 7 } = req.query;

    // Verificar que el dispositivo pertenece al reseller
    const deviceCheck = await pool.query(
      'SELECT id FROM devices WHERE id = $1 AND reseller_id = $2',
      [id, resellerId]
    );

    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const result = await pool.query(`
      SELECT * FROM location_history
      WHERE device_id = $1 
      AND recorded_at >= NOW() - INTERVAL '${parseInt(days)} days'
      ORDER BY recorded_at DESC
    `, [id]);

    res.json({ history: result.rows });
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ error: 'Error obteniendo historial de ubicaciones' });
  }
};
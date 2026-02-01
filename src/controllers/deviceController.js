const pool = require('../config/database');
const { validateUnlockCode } = require('../utils/unlockCodesHelper');

// Registrar dispositivo (llamado por la app Android)
exports.registerDevice = async (req, res) => {
  const client = await pool.connect();
  try {
    const { token, imei, client_name, client_phone } = req.body;

    if (!token || !imei) {
      return res.status(400).json({ error: 'Token e IMEI requeridos' });
    }

    await client.query('BEGIN');

    // Verificar el token de enrolamiento
    const tokenResult = await client.query(`
      SELECT * FROM enrollment_tokens
      WHERE token = $1 AND is_used = false AND expires_at > NOW()
    `, [token]);

    if (tokenResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Token inválido o expirado' });
    }

    const enrollmentToken = tokenResult.rows[0];

    // Verificar si el IMEI ya está registrado
    const existingDevice = await client.query(
      'SELECT * FROM devices WHERE imei = $1',
      [imei]
    );

    if (existingDevice.rows.length > 0) {
      // El IMEI ya existe, verificar si puede re-enrolarse
      const device = existingDevice.rows[0];
      
      // Buscar si hay una licencia VINCULADA con este IMEI
      const linkedLicense = await client.query(`
        SELECT * FROM licenses
        WHERE device_imei = $1 AND status = 'VINCULADA' AND reseller_id = $2
      `, [imei, enrollmentToken.reseller_id]);

      if (linkedLicense.rows.length > 0) {
        // Puede re-enrolarse con su licencia vinculada
        const license = linkedLicense.rows[0];

        await client.query(`
          UPDATE licenses SET status = 'EN_USO' WHERE id = $1
        `, [license.id]);

        await client.query(`
          UPDATE devices 
          SET status = 'ACTIVO', client_name = $1, client_phone = $2, enrolled_at = NOW()
          WHERE id = $3
        `, [client_name, client_phone, device.id]);

        await client.query(`
          UPDATE enrollment_tokens SET is_used = true WHERE id = $1
        `, [enrollmentToken.id]);

        await client.query('COMMIT');

        return res.json({
          message: 'Dispositivo re-enrolado exitosamente',
          device_id: device.id,
          reseller_id: enrollmentToken.reseller_id
        });
      } else {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Este dispositivo ya está registrado y no tiene licencia vinculada disponible' 
        });
      }
    }

    // Es un dispositivo nuevo - usar la licencia del token
    const license = await client.query(
      'SELECT * FROM licenses WHERE id = $1',
      [enrollmentToken.license_id]
    );

    if (license.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Licencia no encontrada' });
    }

    // Crear nuevo dispositivo
    const deviceResult = await client.query(`
      INSERT INTO devices (imei, reseller_id, license_id, client_name, client_phone, status, last_connection, is_online)
      VALUES ($1, $2, $3, $4, $5, 'ACTIVO', NOW(), true)
      RETURNING *
    `, [imei, enrollmentToken.reseller_id, enrollmentToken.license_id, client_name, client_phone]);

    // Actualizar licencia a EN_USO y vincular el IMEI
    await client.query(`
      UPDATE licenses 
      SET status = 'EN_USO', device_imei = $1, activated_at = NOW()
      WHERE id = $2
    `, [imei, enrollmentToken.license_id]);

    // Marcar token como usado
    await client.query(
      'UPDATE enrollment_tokens SET is_used = true WHERE id = $1',
      [enrollmentToken.id]
    );

    await client.query('COMMIT');

    const device = deviceResult.rows[0];

    res.json({
      message: 'Dispositivo enrolado exitosamente',
      device_id: device.id,
      reseller_id: enrollmentToken.reseller_id,
      status: 'ACTIVO'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error registrando dispositivo:', error);
    res.status(500).json({ error: 'Error registrando dispositivo' });
  } finally {
    client.release();
  }
};


// ===================================================
// NUEVO: Buscar dispositivo por IMEI
// ===================================================
exports.getDeviceByImei = async (req, res) => {
  try {
    const { imei } = req.query;

    if (!imei) {
      return res.status(400).json({ error: 'IMEI requerido' });
    }

    console.log(`🔍 Buscando dispositivo con IMEI: ${imei}`);

    const result = await pool.query(
      'SELECT id, reseller_id, status, client_name FROM devices WHERE imei = $1',
      [imei]
    );

    if (result.rows.length === 0) {
      console.log(`⚠️ Dispositivo con IMEI ${imei} no encontrado`);
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const device = result.rows[0];

    console.log(`✅ Dispositivo encontrado - ID: ${device.id}`);

    res.json({
      device_id: device.id,
      reseller_id: device.reseller_id,
      status: device.status,
      client_name: device.client_name
    });
  } catch (error) {
    console.error('Error buscando dispositivo por IMEI:', error);
    res.status(500).json({ error: 'Error buscando dispositivo' });
  }
};

// ===================================================
// NUEVO: Registrar/Actualizar token FCM
// ===================================================
exports.registerFcmToken = async (req, res) => {
  try {
    const { device_id, fcm_token } = req.body;

    if (!device_id || !fcm_token) {
      return res.status(400).json({ error: 'device_id y fcm_token requeridos' });
    }

    // Verificar si ya existe un token para este dispositivo
    const existing = await pool.query(
      'SELECT id FROM device_fcm_tokens WHERE device_id = $1',
      [device_id]
    );

    if (existing.rows.length > 0) {
      // Actualizar token existente
      await pool.query(
        'UPDATE device_fcm_tokens SET fcm_token = $1, updated_at = NOW() WHERE device_id = $2',
        [fcm_token, device_id]
      );
      console.log(`✅ Token FCM actualizado para dispositivo ${device_id}`);
    } else {
      // Insertar nuevo token
      await pool.query(
        'INSERT INTO device_fcm_tokens (device_id, fcm_token) VALUES ($1, $2)',
        [device_id, fcm_token]
      );
      console.log(`✅ Token FCM registrado para dispositivo ${device_id}`);
    }

    res.json({ message: 'Token FCM registrado exitosamente' });
  } catch (error) {
    console.error('Error registrando token FCM:', error);
    res.status(500).json({ error: 'Error registrando token FCM' });
  }
};

// ===================================================
// NUEVO: Validar código de desbloqueo
// ===================================================
exports.validateUnlock = async (req, res) => {
  try {
    const { device_id, code } = req.body;

    if (!device_id || !code) {
      return res.status(400).json({ error: 'device_id y code requeridos' });
    }

    // Validar el código usando la función helper
    const validation = await validateUnlockCode(device_id, code);

    if (validation.valid) {
      // Código válido - desbloquear dispositivo
      await pool.query(
        "UPDATE devices SET status = 'ACTIVO', lock_message = NULL WHERE id = $1",
        [device_id]
      );

      return res.json({
        success: true,
        message: 'Dispositivo desbloqueado exitosamente'
      });
    } else {
      // Código inválido
      return res.status(400).json({
        success: false,
        message: validation.message,
        usedAt: validation.usedAt,
        expiresAt: validation.expiresAt
      });
    }
  } catch (error) {
    console.error('Error validando código de desbloqueo:', error);
    res.status(500).json({ error: 'Error validando código' });
  }
};

// Actualizar ubicación del dispositivo
exports.updateLocation = async (req, res) => {
  const client = await pool.connect();
  try {
    const { device_id, latitude, longitude, battery_level, network_type, accuracy } = req.body;

    if (!device_id || !latitude || !longitude) {
      return res.status(400).json({ error: 'device_id, latitude y longitude requeridos' });
    }

    await client.query('BEGIN');

    // Actualizar última ubicación del dispositivo
    await client.query(`
      UPDATE devices 
      SET last_location_lat = $1, 
          last_location_lon = $2, 
          last_location_accuracy = $3,
          last_location_time = NOW(),
          battery_level = $4,
          last_connection = NOW(),
          is_online = true
      WHERE id = $5
    `, [latitude, longitude, accuracy || null, battery_level, device_id]);

    // Guardar en historial (usando la nueva tabla device_locations)
    await client.query(`
      INSERT INTO device_locations (device_id, latitude, longitude, accuracy, battery_level, recorded_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [device_id, latitude, longitude, accuracy || null, battery_level]);

    await client.query('COMMIT');

    res.json({ message: 'Ubicación actualizada' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error actualizando ubicación:', error);
    res.status(500).json({ error: 'Error actualizando ubicación' });
  } finally {
    client.release();
  }
};

// Obtener comandos pendientes para el dispositivo
exports.getCommands = async (req, res) => {
  try {
    const { device_id } = req.query;

    if (!device_id) {
      return res.status(400).json({ error: 'device_id requerido' });
    }

    const result = await pool.query(`
      SELECT * FROM pending_commands
      WHERE device_id = $1 AND status = 'PENDING'
      ORDER BY created_at ASC
    `, [device_id]);

    // Marcar comandos como enviados
    if (result.rows.length > 0) {
      const commandIds = result.rows.map(c => c.id);
      await pool.query(`
        UPDATE pending_commands 
        SET status = 'SENT' 
        WHERE id = ANY($1)
      `, [commandIds]);
    }

    res.json({ commands: result.rows });
  } catch (error) {
    console.error('Error obteniendo comandos:', error);
    res.status(500).json({ error: 'Error obteniendo comandos' });
  }
};

// Heartbeat del dispositivo
exports.heartbeat = async (req, res) => {
  try {
    const { device_id, battery_level } = req.body;

    if (!device_id) {
      return res.status(400).json({ error: 'device_id requerido' });
    }

    await pool.query(`
      UPDATE devices 
      SET last_connection = NOW(), 
          is_online = true,
          battery_level = $1
      WHERE id = $2
    `, [battery_level, device_id]);

    res.json({ message: 'Heartbeat recibido' });
  } catch (error) {
    console.error('Error en heartbeat:', error);
    res.status(500).json({ error: 'Error en heartbeat' });
  }
};
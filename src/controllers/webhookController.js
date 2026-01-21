const pool = require('../config/database');

exports.handlePubSubNotification = async (req, res) => {
  try {
    // Pub/Sub envía data en base64
    const pubsubMessage = req.body.message;
    
    if (!pubsubMessage || !pubsubMessage.data) {
      console.log('❌ Mensaje Pub/Sub sin data');
      return res.status(400).json({ error: 'Invalid Pub/Sub message' });
    }

    // Decodificar el mensaje
    const dataString = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
    const notification = JSON.parse(dataString);

    console.log('📩 Notificación recibida:', notification);

    // Procesar según el tipo de notificación
    if (notification.notificationType === 'ENROLLMENT') {
      await handleEnrollment(notification);
    } else if (notification.notificationType === 'COMPLIANCE_REPORT') {
      await handleComplianceReport(notification);
    }

    // IMPORTANTE: Responder 200 para que Pub/Sub marque como procesado
    res.status(200).send('OK');
  } catch (error) {
    console.error('❌ Error procesando notificación:', error);
    res.status(500).json({ error: 'Error processing notification' });
  }
};

async function handleEnrollment(notification) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const deviceName = notification.deviceName; // enterprises/LC01l2uql7/devices/XXX
    const enrollmentTokenName = notification.enrollmentTokenName;

    console.log('🆕 Nuevo enrollment:', deviceName);

    // Buscar el token en tu BD
    let licenseId = null;
    let resellerId = null;

    if (enrollmentTokenName) {
      const tokenResult = await client.query(
        'SELECT * FROM enrollment_tokens WHERE token = $1',
        [enrollmentTokenName]
      );

      if (tokenResult.rows.length > 0) {
        const token = tokenResult.rows[0];
        licenseId = token.license_id;
        resellerId = token.reseller_id;

        // Marcar token como usado
        await client.query(
          'UPDATE enrollment_tokens SET is_used = true WHERE id = $1',
          [token.id]
        );
      }
    }

    // Verificar si ya existe
    const existingDevice = await client.query(
      'SELECT * FROM devices WHERE google_device_name = $1',
      [deviceName]
    );

    if (existingDevice.rows.length === 0) {
      // Crear dispositivo
      const deviceId = deviceName.split('/').pop();
      
      await client.query(`
        INSERT INTO devices (
          google_device_name,
          imei,
          reseller_id,
          license_id,
          status,
          enrolled_at,
          last_connection,
          is_online
        ) VALUES ($1, $2, $3, $4, 'ACTIVO', NOW(), NOW(), true)
      `, [deviceName, deviceId, resellerId, licenseId]);

      console.log('✅ Dispositivo creado en BD');

      // Actualizar licencia
      if (licenseId) {
        await client.query(`
          UPDATE licenses 
          SET status = 'EN_USO', activated_at = NOW()
          WHERE id = $1
        `, [licenseId]);
        
        console.log('✅ Licencia actualizada a EN_USO');
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en handleEnrollment:', error);
    throw error;
  } finally {
    client.release();
  }
}

async function handleComplianceReport(notification) {
  // Aquí puedes manejar reportes de compliance
  console.log('📊 Reporte de compliance:', notification);
}

module.exports = {
  handlePubSubNotification,
};
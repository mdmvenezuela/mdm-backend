const pool = require('../config/database');
const { hashPassword, generateLicenseKey } = require('../utils/helpers');

// Dashboard de Super Admin
exports.getDashboard = async (req, res) => {
  try {
    // Total de resellers
    const resellersResult = await pool.query(
      'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM resellers'
    );

    // Total de licencias
    const licensesResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'DISPONIBLE') as disponibles,
        COUNT(*) FILTER (WHERE status = 'EN_USO') as en_uso,
        COUNT(*) FILTER (WHERE status = 'VINCULADA') as vinculadas
      FROM licenses
    `);

    // Total de dispositivos
    const devicesResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'ACTIVO') as activos,
        COUNT(*) FILTER (WHERE status = 'BLOQUEADO') as bloqueados
      FROM devices
    `);

    res.json({
      resellers: resellersResult.rows[0],
      licenses: licensesResult.rows[0],
      devices: devicesResult.rows[0]
    });
  } catch (error) {
    console.error('Error obteniendo dashboard:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
};

// Crear Reseller
exports.createReseller = async (req, res) => {
  const client = await pool.connect();
  try {
    const { business_name, username, email, password, phone, total_licenses } = req.body;

    // Validaciones
    if (!business_name || !username || !email || !password) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    // Verificar si username o email ya existen
    const checkResult = await client.query(
      'SELECT username, email FROM resellers WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (checkResult.rows.length > 0) {
      return res.status(400).json({ error: 'Usuario o email ya existe' });
    }

    const password_hash = await hashPassword(password);

    await client.query('BEGIN');

    // Crear reseller
    const resellerResult = await client.query(
      `INSERT INTO resellers (business_name, username, email, password_hash, phone, total_licenses)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [business_name, username, email, password_hash, phone, total_licenses || 0]
    );

    const reseller = resellerResult.rows[0];

    // Si se asignaron licencias, crearlas
    if (total_licenses && total_licenses > 0) {
      const licenseValues = [];
      for (let i = 0; i < total_licenses; i++) {
        licenseValues.push(`('${generateLicenseKey()}', ${reseller.id})`);
      }
      
      await client.query(`
        INSERT INTO licenses (license_key, reseller_id)
        VALUES ${licenseValues.join(',')}
      `);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Reseller creado exitosamente',
      reseller: {
        id: reseller.id,
        business_name: reseller.business_name,
        username: reseller.username,
        email: reseller.email,
        total_licenses: reseller.total_licenses
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creando reseller:', error);
    res.status(500).json({ error: 'Error creando reseller' });
  } finally {
    client.release();
  }
};

// Obtener todos los resellers
exports.getResellers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        r.*,
        COUNT(l.id) FILTER (WHERE l.status = 'DISPONIBLE') as licenses_available,
        COUNT(l.id) FILTER (WHERE l.status = 'EN_USO') as licenses_in_use,
        COUNT(l.id) FILTER (WHERE l.status = 'VINCULADA') as licenses_linked,
        COUNT(d.id) as total_devices
      FROM resellers r
      LEFT JOIN licenses l ON r.id = l.reseller_id
      LEFT JOIN devices d ON r.id = d.reseller_id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `);

    res.json({ resellers: result.rows });
  } catch (error) {
    console.error('Error obteniendo resellers:', error);
    res.status(500).json({ error: 'Error obteniendo resellers' });
  }
};

// Agregar licencias a un reseller
exports.addLicenses = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Cantidad inválida' });
    }

    await client.query('BEGIN');

    // Verificar que el reseller existe
    const resellerCheck = await client.query(
      'SELECT * FROM resellers WHERE id = $1',
      [id]
    );

    if (resellerCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reseller no encontrado' });
    }

    // Crear las licencias
    const licenseValues = [];
    for (let i = 0; i < quantity; i++) {
      licenseValues.push(`('${generateLicenseKey()}', ${id})`);
    }
    
    await client.query(`
      INSERT INTO licenses (license_key, reseller_id)
      VALUES ${licenseValues.join(',')}
    `);

    // Actualizar total_licenses del reseller
    await client.query(
      'UPDATE resellers SET total_licenses = total_licenses + $1 WHERE id = $2',
      [quantity, id]
    );

    await client.query('COMMIT');

    res.json({
      message: `${quantity} licencias agregadas exitosamente`,
      reseller_id: id,
      licenses_added: quantity
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error agregando licencias:', error);
    res.status(500).json({ error: 'Error agregando licencias' });
  } finally {
    client.release();
  }
};

// Suspender/Activar reseller
exports.toggleResellerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE resellers SET is_active = NOT is_active WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reseller no encontrado' });
    }

    const reseller = result.rows[0];
    const status = reseller.is_active ? 'activado' : 'suspendido';

    res.json({
      message: `Reseller ${status} exitosamente`,
      reseller: {
        id: reseller.id,
        business_name: reseller.business_name,
        is_active: reseller.is_active
      }
    });
  } catch (error) {
    console.error('Error cambiando estado de reseller:', error);
    res.status(500).json({ error: 'Error cambiando estado' });
  }
};

// Ver todos los dispositivos del sistema
exports.getAllDevices = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        d.*,
        r.business_name as reseller_name,
        l.license_key
      FROM devices d
      JOIN resellers r ON d.reseller_id = r.id
      LEFT JOIN licenses l ON d.license_id = l.id
      ORDER BY d.enrolled_at DESC
    `);

    res.json({ devices: result.rows });
  } catch (error) {
    console.error('Error obteniendo dispositivos:', error);
    res.status(500).json({ error: 'Error obteniendo dispositivos' });
  }
};
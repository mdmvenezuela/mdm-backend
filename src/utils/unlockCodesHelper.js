// ===================================================
// UNLOCK CODES HELPER
// Genera y valida códigos de desbloqueo de un solo uso
// ===================================================

const pool = require('../config/database');

/**
 * Generar código de desbloqueo único
 * Formato: UNL-XXXXXX (6 dígitos aleatorios)
 * @returns {string} Código único
 */
function generateUnlockCode() {
  const digits = Math.floor(100000 + Math.random() * 900000); // 6 dígitos
  return `UNL-${digits}`;
}

/**
 * Crear un código de desbloqueo para un dispositivo
 * @param {number} deviceId - ID del dispositivo
 * @param {number} resellerId - ID del reseller que crea el código
 * @param {number} expirationHours - Horas hasta que expire (default: 24)
 * @returns {Promise<string>} El código generado
 */
async function createUnlockCode(deviceId, resellerId, expirationHours = 24) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Invalidar códigos anteriores no usados de este dispositivo
    await client.query(`
      UPDATE unlock_codes 
      SET used = true, used_at = NOW()
      WHERE device_id = $1 AND used = false
    `, [deviceId]);

    // Generar nuevo código único
    let code;
    let attempts = 0;
    let isUnique = false;

    while (!isUnique && attempts < 10) {
      code = generateUnlockCode();
      
      // Verificar que no exista
      const existing = await client.query(
        'SELECT id FROM unlock_codes WHERE code = $1',
        [code]
      );

      if (existing.rows.length === 0) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error('No se pudo generar código único después de 10 intentos');
    }

    // Calcular fecha de expiración
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expirationHours);

    // Insertar el nuevo código
    await client.query(`
      INSERT INTO unlock_codes 
      (device_id, code, expires_at, created_by)
      VALUES ($1, $2, $3, $4)
    `, [deviceId, code, expiresAt, resellerId]);

    await client.query('COMMIT');

    console.log(`✅ Código de desbloqueo creado: ${code} (expira en ${expirationHours}h)`);
    return code;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creando código de desbloqueo:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Validar código de desbloqueo
 * @param {number} deviceId - ID del dispositivo
 * @param {string} code - Código a validar
 * @returns {Promise<object>} { valid: boolean, message: string }
 */
async function validateUnlockCode(deviceId, code) {
  const client = await pool.connect();

  try {
    // Buscar el código
    const result = await client.query(`
      SELECT * FROM unlock_codes
      WHERE device_id = $1 AND code = $2
    `, [deviceId, code]);

    // Código no existe
    if (result.rows.length === 0) {
      return {
        valid: false,
        message: 'Código inválido'
      };
    }

    const unlockCode = result.rows[0];

    // Verificar si ya fue usado
    if (unlockCode.used) {
      return {
        valid: false,
        message: 'Código ya utilizado',
        usedAt: unlockCode.used_at
      };
    }

    // Verificar si expiró
    const now = new Date();
    const expiresAt = new Date(unlockCode.expires_at);

    if (now > expiresAt) {
      return {
        valid: false,
        message: 'Código expirado',
        expiresAt: unlockCode.expires_at
      };
    }

    // ✅ Código válido - marcarlo como usado
    await client.query(`
      UPDATE unlock_codes
      SET used = true, used_at = NOW()
      WHERE id = $1
    `, [unlockCode.id]);

    console.log(`✅ Código ${code} validado y marcado como usado`);

    return {
      valid: true,
      message: 'Código válido',
      codeId: unlockCode.id
    };

  } catch (error) {
    console.error('❌ Error validando código:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Obtener código activo de un dispositivo
 * @param {number} deviceId - ID del dispositivo
 * @returns {Promise<object|null>} Código activo o null
 */
async function getActiveUnlockCode(deviceId) {
  try {
    const result = await pool.query(`
      SELECT * FROM unlock_codes
      WHERE device_id = $1 
        AND used = false 
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `, [deviceId]);

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('❌ Error obteniendo código activo:', error);
    throw error;
  }
}

/**
 * Eliminar códigos expirados (limpieza)
 * @returns {Promise<number>} Cantidad de códigos eliminados
 */
async function cleanExpiredCodes() {
  try {
    const result = await pool.query(`
      DELETE FROM unlock_codes
      WHERE expires_at < NOW() - INTERVAL '7 days'
    `);

    console.log(`🗑️  ${result.rowCount} códigos expirados eliminados`);
    return result.rowCount;
  } catch (error) {
    console.error('❌ Error limpiando códigos expirados:', error);
    throw error;
  }
}

// ===================================================
// EXPORTAR FUNCIONES
// ===================================================

module.exports = {
  generateUnlockCode,
  createUnlockCode,
  validateUnlockCode,
  getActiveUnlockCode,
  cleanExpiredCodes
};
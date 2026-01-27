// ===================================================
// ENDPOINTS DE GESTIÓN DE POLÍTICAS ANDROID ENTERPRISE
// Versión final adaptada a tu estructura de BD
// Archivo: routes/policies.js
// ===================================================

const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const pool = require('../config/database'); // Tu conexión a PostgreSQL
const { authenticateToken } = require('../middleware/auth'); // Ajusta la ruta

// Middleware para verificar que el usuario sea super_admin
const authenticateSuperAdmin = async (req, res, next) => {
  try {
    // Primero verificar el token (esto llena req.user)
    await authenticateToken(req, res, () => {});
    
    // Verificar que sea super_admin
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ 
        error: 'Acceso denegado. Solo super administradores pueden gestionar políticas.' 
      });
    }
    
    next();
  } catch (error) {
    console.error('Error en authenticateSuperAdmin:', error);
    return res.status(401).json({ error: 'No autorizado' });
  }
};

// ===================================================
// HELPER: Obtener credenciales de Google desde Base64
// ===================================================
function getGoogleCredentials() {
  try {
    const base64Credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
    
    if (!base64Credentials) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS_BASE64 no está configurada');
    }

    const jsonCredentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const credentials = JSON.parse(jsonCredentials);
    
    console.log('✅ Credenciales de Google cargadas desde base64');
    return credentials;
    
  } catch (error) {
    console.error('❌ Error cargando credenciales de Google:', error.message);
    throw error;
  }
}

// ===================================================
// HELPER: Obtener cliente autenticado de Google
// ===================================================
function getGoogleAuthClient() {
  const credentials = getGoogleCredentials();
  
  const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ['https://www.googleapis.com/auth/androidmanagement']
  });
  
  return auth;
}

/**
 * GET /admin/policies
 * Obtener todas las políticas
 */
router.get('/admin/policies', authenticateSuperAdmin, async (req, res) => {
  try {
    const adminId = req.user.id;

    // Obtener políticas de la BD (PostgreSQL)
    const result = await pool.query(`
      SELECT 
        p.*,
        COUNT(d.id) as device_count
      FROM policies p
      LEFT JOIN devices d ON d.policy_id = p.id
      WHERE p.super_admin_id = $1
      GROUP BY p.id
      ORDER BY p.is_default DESC, p.created_at DESC
    `, [adminId]);

    res.json({ policies: result.rows });

  } catch (error) {
    console.error('Error fetching policies:', error);
    res.status(500).json({ error: 'Error obteniendo políticas' });
  }
});

/**
 * POST /admin/policy
 * Crear nueva política
 */
router.post('/admin/policy', authenticateSuperAdmin, async (req, res) => {
  try {
    const { name, description, configuration, is_default } = req.body;
    const adminId = req.user.id;

    // Validar datos
    if (!name || !configuration) {
      return res.status(400).json({ error: 'Nombre y configuración son requeridos' });
    }

    // Validar que la configuración sea JSON válido
    let parsedConfig;
    try {
      parsedConfig = typeof configuration === 'string' 
        ? JSON.parse(configuration) 
        : configuration;
    } catch (err) {
      return res.status(400).json({ error: 'Configuración JSON inválida' });
    }

    // Si se marca como default, quitar el flag de las demás
    if (is_default) {
      await pool.query(
        'UPDATE policies SET is_default = false WHERE admin_id = $1',
        [adminId]
      );
    }

    // Crear la política en la BD
    const result = await pool.query(`
      INSERT INTO policies (
        admin_id, name, description, configuration, is_default, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id
    `, [adminId, name, description, JSON.stringify(parsedConfig), is_default || false]);

    const policyId = result.rows[0].id;

    // Crear la política en Android Enterprise
    const androidPolicy = await createAndroidEnterprisePolicy(parsedConfig, name);

    // Guardar el policy_name de Android Enterprise
    await pool.query(
      'UPDATE policies SET android_policy_name = $1 WHERE id = $2',
      [androidPolicy.name, policyId]
    );

    console.log('✅ Política creada:', name);

    res.json({ 
      success: true, 
      policy_id: policyId,
      android_policy_name: androidPolicy.name,
      message: 'Política creada exitosamente' 
    });

  } catch (error) {
    console.error('❌ Error creating policy:', error);
    res.status(500).json({ 
      error: 'Error creando política',
      details: error.message 
    });
  }
});

/**
 * PUT /admin/policy/:id
 * Actualizar política existente
 */
router.put('/admin/policy/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, configuration, is_default } = req.body;
    const adminId = req.user.id;

    // Verificar que la política pertenece al admin
    const policyResult = await pool.query(
      'SELECT * FROM policies WHERE id = $1 AND admin_id = $2',
      [id, adminId]
    );

    if (policyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Política no encontrada' });
    }

    const policy = policyResult.rows[0];

    // Validar configuración
    let parsedConfig;
    try {
      parsedConfig = typeof configuration === 'string' 
        ? JSON.parse(configuration) 
        : configuration;
    } catch (err) {
      return res.status(400).json({ error: 'Configuración JSON inválida' });
    }

    // Si se marca como default, quitar el flag de las demás
    if (is_default) {
      await pool.query(
        'UPDATE policies SET is_default = false WHERE admin_id = $1 AND id != $2',
        [adminId, id]
      );
    }

    // Actualizar en BD
    await pool.query(`
      UPDATE policies 
      SET name = $1, description = $2, configuration = $3, is_default = $4, updated_at = NOW()
      WHERE id = $5
    `, [name, description, JSON.stringify(parsedConfig), is_default || false, id]);

    // Actualizar en Android Enterprise
    const androidPolicy = await updateAndroidEnterprisePolicy(
      policy.android_policy_name,
      parsedConfig,
      name
    );

    // Aplicar a todos los dispositivos que usan esta política
    await applyPolicyToDevices(id);

    console.log('✅ Política actualizada:', name);

    res.json({ 
      success: true,
      message: 'Política actualizada exitosamente. Los cambios se aplicarán a los dispositivos.' 
    });

  } catch (error) {
    console.error('❌ Error updating policy:', error);
    res.status(500).json({ 
      error: 'Error actualizando política',
      details: error.message 
    });
  }
});

/**
 * DELETE /admin/policy/:id
 * Eliminar política
 */
router.delete('/admin/policy/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    // Verificar que la política pertenece al admin
    const policyResult = await pool.query(
      'SELECT * FROM policies WHERE id = $1 AND admin_id = $2',
      [id, adminId]
    );

    if (policyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Política no encontrada' });
    }

    const policy = policyResult.rows[0];

    // No permitir eliminar la política por defecto
    if (policy.is_default) {
      return res.status(400).json({ 
        error: 'No puedes eliminar la política por defecto. Marca otra como defecto primero.' 
      });
    }

    // Obtener la política por defecto
    const defaultPolicyResult = await pool.query(
      'SELECT id FROM policies WHERE admin_id = $1 AND is_default = true',
      [adminId]
    );

    if (defaultPolicyResult.rows.length === 0) {
      return res.status(400).json({ 
        error: 'Debes tener una política por defecto antes de eliminar otras' 
      });
    }

    const defaultPolicyId = defaultPolicyResult.rows[0].id;

    // Mover dispositivos que usan esta política a la política por defecto
    await pool.query(
      'UPDATE devices SET policy_id = $1 WHERE policy_id = $2',
      [defaultPolicyId, id]
    );

    // Eliminar la política de Android Enterprise
    if (policy.android_policy_name) {
      await deleteAndroidEnterprisePolicy(policy.android_policy_name);
    }

    // Eliminar de BD
    await pool.query('DELETE FROM policies WHERE id = $1', [id]);

    console.log('✅ Política eliminada:', policy.name);

    res.json({ 
      success: true,
      message: 'Política eliminada. Los dispositivos ahora usan la política por defecto.' 
    });

  } catch (error) {
    console.error('❌ Error deleting policy:', error);
    res.status(500).json({ 
      error: 'Error eliminando política',
      details: error.message 
    });
  }
});

// ===================================================
// FUNCIONES HELPER PARA ANDROID ENTERPRISE
// ===================================================

async function createAndroidEnterprisePolicy(config, name) {
  try {
    const auth = getGoogleAuthClient();
    
    const androidmanagement = google.androidmanagement({
      version: 'v1',
      auth: auth
    });

    const enterpriseName = process.env.ANDROID_ENTERPRISE_NAME;

    if (!enterpriseName) {
      throw new Error('ANDROID_ENTERPRISE_NAME no está configurada');
    }

    const policyName = `${enterpriseName}/policies/${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
    
    const policy = {
      applications: buildApplicationsPolicy(config),
      passwordRequirements: buildPasswordPolicy(config),
      maximumTimeToLock: config.maximumTimeToLock || null,
      encryptionPolicy: config.encryptionPolicy || 'ENABLED_WITHOUT_PASSWORD',
      cameraDisabled: config.cameraDisabled || false,
      screenCaptureDisabled: config.screenCaptureDisabled || false,
      bluetoothDisabled: config.bluetoothDisabled || false,
      usbFileTransferDisabled: config.usbFileTransferDisabled || false,
      factoryResetDisabled: config.factoryResetDisabled || false,
      installUnknownSourcesAllowed: config.installUnknownSourcesAllowed || false,
      wifiConfigsLockdownEnabled: config.wifiConfigsLockdownEnabled || false,
      statusBarDisabled: config.statusBarDisabled || false,
      keyguardDisabled: config.keyguardDisabled || false
    };

    if (config.kioskMode && config.kioskApps && config.kioskApps.length > 0) {
      policy.kioskCustomization = {
        deviceSettings: 'SETTINGS_ACCESS_ALLOWED',
        powerButtonActions: 'POWER_BUTTON_AVAILABLE',
        systemErrorWarnings: 'ERROR_AND_WARNINGS_ENABLED',
        systemNavigation: 'NAVIGATION_ENABLED'
      };
      
      policy.persistentPreferredActivities = config.kioskApps.map(packageName => ({
        receiverActivity: packageName,
        actions: ['android.intent.action.MAIN'],
        categories: ['android.intent.category.HOME', 'android.intent.category.DEFAULT']
      }));
    }

    const response = await androidmanagement.enterprises.policies.patch({
      name: policyName,
      updateMask: Object.keys(policy).filter(k => policy[k] !== null && policy[k] !== undefined).join(','),
      requestBody: policy
    });

    console.log('✅ Política creada en Android Enterprise:', response.data.name);
    return response.data;

  } catch (error) {
    console.error('❌ Error creando política en Android Enterprise:', error.message);
    throw error;
  }
}

async function updateAndroidEnterprisePolicy(policyName, config, displayName) {
  try {
    const auth = getGoogleAuthClient();
    
    const androidmanagement = google.androidmanagement({
      version: 'v1',
      auth: auth
    });

    const policy = {
      applications: buildApplicationsPolicy(config),
      passwordRequirements: buildPasswordPolicy(config),
      maximumTimeToLock: config.maximumTimeToLock || null,
      encryptionPolicy: config.encryptionPolicy || 'ENABLED_WITHOUT_PASSWORD',
      cameraDisabled: config.cameraDisabled || false,
      screenCaptureDisabled: config.screenCaptureDisabled || false,
      bluetoothDisabled: config.bluetoothDisabled || false,
      usbFileTransferDisabled: config.usbFileTransferDisabled || false,
      factoryResetDisabled: config.factoryResetDisabled || false,
      installUnknownSourcesAllowed: config.installUnknownSourcesAllowed || false,
      wifiConfigsLockdownEnabled: config.wifiConfigsLockdownEnabled || false,
      statusBarDisabled: config.statusBarDisabled || false,
      keyguardDisabled: config.keyguardDisabled || false
    };

    if (config.kioskMode && config.kioskApps && config.kioskApps.length > 0) {
      policy.kioskCustomization = {
        deviceSettings: 'SETTINGS_ACCESS_ALLOWED',
        powerButtonActions: 'POWER_BUTTON_AVAILABLE',
        systemErrorWarnings: 'ERROR_AND_WARNINGS_ENABLED',
        systemNavigation: 'NAVIGATION_ENABLED'
      };
      
      policy.persistentPreferredActivities = config.kioskApps.map(packageName => ({
        receiverActivity: packageName,
        actions: ['android.intent.action.MAIN'],
        categories: ['android.intent.category.HOME', 'android.intent.category.DEFAULT']
      }));
    }

    const response = await androidmanagement.enterprises.policies.patch({
      name: policyName,
      updateMask: Object.keys(policy).filter(k => policy[k] !== null && policy[k] !== undefined).join(','),
      requestBody: policy
    });

    console.log('✅ Política actualizada en Android Enterprise');
    return response.data;

  } catch (error) {
    console.error('❌ Error actualizando política:', error.message);
    throw error;
  }
}

async function deleteAndroidEnterprisePolicy(policyName) {
  try {
    const auth = getGoogleAuthClient();
    
    const androidmanagement = google.androidmanagement({
      version: 'v1',
      auth: auth
    });

    await androidmanagement.enterprises.policies.delete({
      name: policyName
    });

    console.log('✅ Política eliminada de Android Enterprise');

  } catch (error) {
    console.error('❌ Error eliminando política:', error.message);
  }
}

function buildApplicationsPolicy(config) {
  const applications = [];

  applications.push({
    packageName: 'com.google.android.apps.work.clouddpc',
    installType: 'FORCE_INSTALLED',
    defaultPermissionPolicy: 'GRANT'
  });

  if (config.allowedApps && config.allowedApps.length > 0) {
    config.allowedApps.forEach(packageName => {
      applications.push({
        packageName,
        installType: 'AVAILABLE',
        defaultPermissionPolicy: 'GRANT'
      });
    });
  }

  if (config.blockedApps && config.blockedApps.length > 0) {
    config.blockedApps.forEach(packageName => {
      applications.push({
        packageName,
        installType: 'BLOCKED'
      });
    });
  }

  if (config.kioskMode && config.kioskApps && config.kioskApps.length > 0) {
    config.kioskApps.forEach(packageName => {
      if (!applications.find(app => app.packageName === packageName)) {
        applications.push({
          packageName,
          installType: 'KIOSK',
          defaultPermissionPolicy: 'GRANT',
          lockTaskAllowed: true
        });
      }
    });
  }

  return applications;
}

function buildPasswordPolicy(config) {
  if (!config.passwordRequired) {
    return null;
  }

  return {
    passwordMinimumLength: config.passwordMinLength || 6,
    passwordQuality: config.passwordQuality || 'NUMERIC',
    passwordMinimumLetters: config.passwordQuality === 'ALPHABETIC' ? 1 : undefined,
    passwordMinimumNumeric: config.passwordQuality === 'NUMERIC' ? 1 : undefined,
    passwordMinimumSymbols: config.passwordQuality === 'COMPLEX' ? 1 : undefined
  };
}

async function applyPolicyToDevices(policyId) {
  try {
    const devicesResult = await pool.query(
      'SELECT google_device_name FROM devices WHERE policy_id = $1 AND google_device_name IS NOT NULL',
      [policyId]
    );

    const devices = devicesResult.rows;

    if (devices.length === 0) {
      console.log('No hay dispositivos usando esta política');
      return;
    }

    const auth = getGoogleAuthClient();
    
    const androidmanagement = google.androidmanagement({
      version: 'v1',
      auth: auth
    });

    const policyResult = await pool.query(
      'SELECT android_policy_name FROM policies WHERE id = $1',
      [policyId]
    );

    if (policyResult.rows.length === 0 || !policyResult.rows[0].android_policy_name) {
      return;
    }

    const policyName = policyResult.rows[0].android_policy_name;

    for (const device of devices) {
      try {
        await androidmanagement.enterprises.devices.patch({
          name: device.google_device_name,
          updateMask: 'policyName',
          requestBody: {
            policyName: policyName
          }
        });

        console.log('✅ Política aplicada a dispositivo:', device.google_device_name);
      } catch (err) {
        console.error('Error aplicando política a dispositivo:', device.google_device_name, err.message);
      }
    }

  } catch (error) {
    console.error('Error aplicando políticas a dispositivos:', error.message);
  }
}

module.exports = router;
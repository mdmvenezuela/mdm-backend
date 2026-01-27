// ===================================================
// ENDPOINTS DE GESTIÓN DE POLÍTICAS ANDROID ENTERPRISE
// Versión que trabaja directamente con Android Enterprise API
// Archivo: routes/policies.js
// ===================================================

const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// Middleware para verificar que el usuario sea super_admin
const authenticateSuperAdmin = async (req, res, next) => {
  try {
    await authenticateToken(req, res, () => {});
    
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
    
    return credentials;
    
  } catch (error) {
    console.error('❌ Error cargando credenciales de Google:', error.message);
    throw error;
  }
}

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
 * Listar todas las políticas desde Android Enterprise
 */
router.get('/admin/policies', authenticateSuperAdmin, async (req, res) => {
  try {
    const auth = getGoogleAuthClient();
    
    const androidmanagement = google.androidmanagement({
      version: 'v1',
      auth: auth
    });

    const enterpriseName = process.env.ANDROID_ENTERPRISE_NAME;

    if (!enterpriseName) {
      return res.status(500).json({ 
        error: 'ANDROID_ENTERPRISE_NAME no está configurada' 
      });
    }

    // Obtener políticas directamente de Android Enterprise
    const response = await androidmanagement.enterprises.policies.list({
      parent: enterpriseName
    });

    const androidPolicies = response.data.policies || [];

    // Transformar las políticas al formato que espera el frontend
    const formattedPolicies = androidPolicies.map(policy => {
      // Extraer configuración de la política de Android
      const configuration = {
        passwordRequired: !!policy.passwordRequirements,
        passwordMinLength: policy.passwordRequirements?.passwordMinimumLength || 6,
        passwordQuality: policy.passwordRequirements?.passwordQuality || 'NUMERIC',
        maximumTimeToLock: policy.maximumTimeToLock || null,
        encryptionPolicy: policy.encryptionPolicy || 'ENABLED_WITHOUT_PASSWORD',
        cameraDisabled: policy.cameraDisabled || false,
        screenCaptureDisabled: policy.screenCaptureDisabled || false,
        bluetoothDisabled: policy.bluetoothDisabled || false,
        usbFileTransferDisabled: policy.usbFileTransferDisabled || false,
        factoryResetDisabled: policy.factoryResetDisabled || false,
        installUnknownSourcesAllowed: policy.installUnknownSourcesAllowed || false,
        wifiConfigsLockdownEnabled: policy.wifiConfigsLockdownEnabled || false,
        statusBarDisabled: policy.statusBarDisabled || false,
        keyguardDisabled: policy.keyguardDisabled || false,
        kioskMode: !!policy.kioskCustomization,
        kioskApps: policy.persistentPreferredActivities?.map(a => a.receiverActivity) || [],
        allowedApps: policy.applications?.filter(a => a.installType === 'AVAILABLE').map(a => a.packageName) || [],
        blockedApps: policy.applications?.filter(a => a.installType === 'BLOCKED').map(a => a.packageName) || []
      };

      // Extraer el nombre legible de la política
      const policyNameParts = policy.name.split('/');
      const policyId = policyNameParts[policyNameParts.length - 1];
      
      return {
        id: policyId,
        name: policyId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: `Política de Android Enterprise (Versión ${policy.version || '1'})`,
        configuration: JSON.stringify(configuration),
        android_policy_name: policy.name,
        is_default: policyId === 'default',
        device_count: 0,
        created_at: null,
        updated_at: null
      };
    });

    console.log(`✅ Listadas ${formattedPolicies.length} políticas de Android Enterprise`);

    res.json({ policies: formattedPolicies });

  } catch (error) {
    console.error('Error fetching policies from Android Enterprise:', error);
    res.status(500).json({ 
      error: 'Error obteniendo políticas de Android Enterprise',
      details: error.message 
    });
  }
});

/**
 * POST /admin/policy
 * Crear nueva política en Android Enterprise
 */
router.post('/admin/policy', authenticateSuperAdmin, async (req, res) => {
  try {
    const { name, description, configuration, is_default } = req.body;

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

    // Crear la política en Android Enterprise
    const androidPolicy = await createAndroidEnterprisePolicy(parsedConfig, name);

    console.log('✅ Política creada en Android Enterprise:', androidPolicy.name);

    res.json({ 
      success: true, 
      android_policy_name: androidPolicy.name,
      message: 'Política creada exitosamente en Android Enterprise' 
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
 * Actualizar política existente en Android Enterprise
 */
router.put('/admin/policy/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, configuration, is_default } = req.body;

    const enterpriseName = process.env.ANDROID_ENTERPRISE_NAME;
    const policyName = `${enterpriseName}/policies/${id}`;

    // Validar configuración
    let parsedConfig;
    try {
      parsedConfig = typeof configuration === 'string' 
        ? JSON.parse(configuration) 
        : configuration;
    } catch (err) {
      return res.status(400).json({ error: 'Configuración JSON inválida' });
    }

    // Actualizar en Android Enterprise
    await updateAndroidEnterprisePolicy(policyName, parsedConfig, name);

    console.log('✅ Política actualizada en Android Enterprise:', policyName);

    res.json({ 
      success: true,
      message: 'Política actualizada exitosamente en Android Enterprise' 
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
 * Eliminar política de Android Enterprise
 */
router.delete('/admin/policy/:id', authenticateSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // No permitir eliminar la política default
    if (id === 'default') {
      return res.status(400).json({ 
        error: 'No puedes eliminar la política default de Android Enterprise.' 
      });
    }

    const enterpriseName = process.env.ANDROID_ENTERPRISE_NAME;
    const policyName = `${enterpriseName}/policies/${id}`;

    // Eliminar la política de Android Enterprise
    await deleteAndroidEnterprisePolicy(policyName);

    console.log('✅ Política eliminada de Android Enterprise:', policyName);

    res.json({ 
      success: true,
      message: 'Política eliminada de Android Enterprise' 
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
    throw error;
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

module.exports = router;
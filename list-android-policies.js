// ===================================================
// SCRIPT PARA LISTAR POLÍTICAS DE ANDROID ENTERPRISE
// Archivo: list-android-policies.js
// ===================================================
require('dotenv').config();
const { google } = require('googleapis');

console.log('🔍 Listando Políticas de Android Enterprise\n');

// ===================================================
// HELPER: Obtener credenciales desde Base64
// ===================================================
function getGoogleCredentials() {
  try {
    const base64Credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
    
    if (!base64Credentials) {
      throw new Error('❌ GOOGLE_APPLICATION_CREDENTIALS_BASE64 no está configurada');
    }

    const jsonCredentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const credentials = JSON.parse(jsonCredentials);
    
    return credentials;
    
  } catch (error) {
    console.error('❌ Error cargando credenciales:', error.message);
    throw error;
  }
}

// ===================================================
// LISTAR POLÍTICAS
// ===================================================
async function listPolicies() {
  try {
    console.log('🔐 Autenticando con Google...');
    
    const credentials = getGoogleCredentials();
    
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/androidmanagement']
    });
    
    console.log('✅ Autenticación exitosa\n');
    
    const androidmanagement = google.androidmanagement({
      version: 'v1',
      auth: auth
    });

    const enterpriseName = process.env.ANDROID_ENTERPRISE_NAME;

    if (!enterpriseName) {
      throw new Error('❌ ANDROID_ENTERPRISE_NAME no está configurada');
    }

    console.log('🏢 Enterprise:', enterpriseName);
    console.log('📡 Consultando políticas...\n');

    // Listar políticas
    const response = await androidmanagement.enterprises.policies.list({
      parent: enterpriseName
    });

    const policies = response.data.policies || [];

    if (policies.length === 0) {
      console.log('📭 No hay políticas creadas en Android Enterprise');
      console.log('\n💡 Crea una política desde el panel de Super Admin para verla aquí.');
      return;
    }

    console.log(`✅ Se encontraron ${policies.length} política(s):\n`);
    console.log('═'.repeat(80));

    policies.forEach((policy, index) => {
      console.log(`\n📋 POLÍTICA ${index + 1}:`);
      console.log('─'.repeat(80));
      console.log('🆔 Name:', policy.name);
      console.log('📅 Version:', policy.version || 'N/A');
      
      // Mostrar configuraciones principales
      console.log('\n⚙️  Configuraciones:');
      
      if (policy.passwordRequirements) {
        console.log('  🔐 Contraseña requerida:');
        console.log('    - Longitud mínima:', policy.passwordRequirements.passwordMinimumLength || 'N/A');
        console.log('    - Calidad:', policy.passwordRequirements.passwordQuality || 'N/A');
      }
      
      if (policy.maximumTimeToLock) {
        console.log('  ⏱️  Tiempo máximo de bloqueo:', policy.maximumTimeToLock, 'ms');
      }
      
      console.log('  📷 Cámara deshabilitada:', policy.cameraDisabled ? '✅ Sí' : '❌ No');
      console.log('  📸 Captura de pantalla:', policy.screenCaptureDisabled ? '✅ Deshabilitada' : '❌ Permitida');
      console.log('  📶 Bluetooth:', policy.bluetoothDisabled ? '✅ Deshabilitado' : '❌ Habilitado');
      console.log('  🔌 Transferencia USB:', policy.usbFileTransferDisabled ? '✅ Deshabilitada' : '❌ Permitida');
      console.log('  🏭 Factory Reset:', policy.factoryResetDisabled ? '✅ Deshabilitado' : '❌ Permitido');
      console.log('  🔓 Fuentes desconocidas:', policy.installUnknownSourcesAllowed ? '✅ Permitidas' : '❌ Bloqueadas');
      
      // Apps
      if (policy.applications && policy.applications.length > 0) {
        console.log('\n📱 Aplicaciones configuradas:', policy.applications.length);
        
        const forcedApps = policy.applications.filter(app => app.installType === 'FORCE_INSTALLED');
        const kioskApps = policy.applications.filter(app => app.installType === 'KIOSK');
        const blockedApps = policy.applications.filter(app => app.installType === 'BLOCKED');
        const availableApps = policy.applications.filter(app => app.installType === 'AVAILABLE');
        
        if (forcedApps.length > 0) {
          console.log(`  📥 Instalación forzada (${forcedApps.length}):`);
          forcedApps.forEach(app => console.log(`    - ${app.packageName}`));
        }
        
        if (kioskApps.length > 0) {
          console.log(`  🔒 Modo Kiosk (${kioskApps.length}):`);
          kioskApps.forEach(app => console.log(`    - ${app.packageName}`));
        }
        
        if (availableApps.length > 0) {
          console.log(`  ✅ Disponibles (${availableApps.length}):`);
          availableApps.forEach(app => console.log(`    - ${app.packageName}`));
        }
        
        if (blockedApps.length > 0) {
          console.log(`  🚫 Bloqueadas (${blockedApps.length}):`);
          blockedApps.forEach(app => console.log(`    - ${app.packageName}`));
        }
      }
      
      // Modo Kiosk
      if (policy.kioskCustomization) {
        console.log('\n🖥️  Modo Kiosk: ✅ Habilitado');
        console.log('  - Configuración de dispositivo:', policy.kioskCustomization.deviceSettings);
        console.log('  - Navegación del sistema:', policy.kioskCustomization.systemNavigation);
      }
      
      console.log('═'.repeat(80));
    });

    console.log('\n✅ Consulta completada');
    console.log(`\n💾 Total de políticas: ${policies.length}`);

  } catch (error) {
    console.error('\n❌ Error listando políticas:', error.message);
    
    if (error.code === 403) {
      console.log('\n💡 Solución:');
      console.log('El Service Account no tiene permisos para listar políticas.');
      console.log('Verifica que tenga el rol de Android Management API.');
    } else if (error.code === 404) {
      console.log('\n💡 Solución:');
      console.log('El enterprise no existe o el nombre es incorrecto.');
      console.log('Verifica: ANDROID_ENTERPRISE_NAME=' + process.env.ANDROID_ENTERPRISE_NAME);
    }
    
    console.log('\nError completo:', error);
  }
}

// ===================================================
// EJECUTAR
// ===================================================

(async () => {
  try {
    await listPolicies();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
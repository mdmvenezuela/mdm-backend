// ===================================================
// SCRIPT PARA LISTAR DISPOSITIVOS ENROLLADOS EN ANDROID ENTERPRISE
// Archivo: list-enrolled-devices.js
// ===================================================
require('dotenv').config();
const { google } = require('googleapis');

console.log('🔍 Listando Dispositivos Enrollados en Android Enterprise\n');

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
// LISTAR DISPOSITIVOS
// ===================================================
async function listDevices() {
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
    console.log('📡 Consultando dispositivos...\n');

    // Listar dispositivos
    const response = await androidmanagement.enterprises.devices.list({
      parent: enterpriseName
    });

    const devices = response.data.devices || [];

    if (devices.length === 0) {
      console.log('📭 No hay dispositivos enrollados en Android Enterprise');
      console.log('\n💡 Si acabas de enrollar un dispositivo, puede tomar unos minutos en aparecer.');
      return;
    }

    console.log(`✅ Se encontraron ${devices.length} dispositivo(s):\n`);
    console.log('═'.repeat(100));

    devices.forEach((device, index) => {
      console.log(`\n📱 DISPOSITIVO ${index + 1}:`);
      console.log('─'.repeat(100));
      
      // Información básica
      console.log('🆔 Device Name:', device.name);
      console.log('📅 Estado:', device.state || 'N/A');
      console.log('📅 Estado Aplicado:', device.appliedState || 'N/A');
      
      // Hardware Info
      if (device.hardwareInfo) {
        console.log('\n💻 Hardware:');
        console.log('  - Fabricante:', device.hardwareInfo.manufacturer || 'N/A');
        console.log('  - Modelo:', device.hardwareInfo.model || 'N/A');
        console.log('  - Serial Number:', device.hardwareInfo.serialNumber || 'N/A');
        console.log('  - Brand:', device.hardwareInfo.brand || 'N/A');
        console.log('  - Hardware:', device.hardwareInfo.hardware || 'N/A');
      }
      
      // Software Info
      if (device.softwareInfo) {
        console.log('\n📱 Software:');
        console.log('  - Android Version:', device.softwareInfo.androidVersion || 'N/A');
        console.log('  - Build Number:', device.softwareInfo.androidBuildNumber || 'N/A');
        console.log('  - Security Patch:', device.softwareInfo.securityPatchLevel || 'N/A');
        console.log('  - Device Kernel:', device.softwareInfo.deviceKernelVersion || 'N/A');
      }
      
      // Política
      if (device.policyName) {
        console.log('\n🛡️  Política Aplicada:', device.policyName);
      }
      
      // Usuario
      if (device.userName) {
        console.log('\n👤 Usuario:', device.userName);
      }
      
      // Enrollment
      if (device.enrollmentTime) {
        console.log('\n📅 Fecha de Enrollment:', new Date(device.enrollmentTime).toLocaleString());
      }
      
      // Último reporte
      if (device.lastStatusReportTime) {
        console.log('⏰ Último Reporte:', new Date(device.lastStatusReportTime).toLocaleString());
      }
      
      if (device.lastPolicySyncTime) {
        console.log('🔄 Último Sync de Política:', new Date(device.lastPolicySyncTime).toLocaleString());
      }
      
      // Memoria
      if (device.memoryInfo) {
        console.log('\n💾 Memoria:');
        console.log('  - RAM Total:', device.memoryInfo.totalRam ? `${(device.memoryInfo.totalRam / (1024**3)).toFixed(2)} GB` : 'N/A');
        console.log('  - Almacenamiento Total:', device.memoryInfo.totalInternalStorage ? `${(device.memoryInfo.totalInternalStorage / (1024**3)).toFixed(2)} GB` : 'N/A');
      }
      
      // Network Info
      if (device.networkInfo) {
        console.log('\n📶 Network:');
        console.log('  - IMEI:', device.networkInfo.imei || 'N/A');
        console.log('  - MEID:', device.networkInfo.meid || 'N/A');
        console.log('  - Network Operator:', device.networkInfo.networkOperatorName || 'N/A');
      }
      
      // Apps instaladas
      if (device.applicationReports && device.applicationReports.length > 0) {
        console.log(`\n📲 Aplicaciones Instaladas: ${device.applicationReports.length}`);
        console.log('  Primeras 5 apps:');
        device.applicationReports.slice(0, 5).forEach(app => {
          console.log(`    - ${app.displayName || app.packageName} (${app.packageName})`);
        });
        if (device.applicationReports.length > 5) {
          console.log(`    ... y ${device.applicationReports.length - 5} más`);
        }
      }
      
      // Compliance
      if (device.nonComplianceDetails && device.nonComplianceDetails.length > 0) {
        console.log('\n⚠️  No Cumplimiento:', device.nonComplianceDetails.length, 'problema(s)');
        device.nonComplianceDetails.forEach(detail => {
          console.log(`    - ${detail.settingName}: ${detail.nonComplianceReason}`);
        });
      }
      
      console.log('═'.repeat(100));
    });

    console.log('\n✅ Consulta completada');
    console.log(`\n💾 Total de dispositivos enrollados: ${devices.length}`);
    
    // Mostrar IMEIs para facilitar búsqueda
    console.log('\n📋 Lista de IMEIs encontrados:');
    devices.forEach((device, index) => {
      const imei = device.networkInfo?.imei || 'Sin IMEI';
      const modelo = device.hardwareInfo?.model || 'Desconocido';
      console.log(`   ${index + 1}. ${imei} - ${modelo}`);
    });

  } catch (error) {
    console.error('\n❌ Error listando dispositivos:', error.message);
    
    if (error.code === 403) {
      console.log('\n💡 Solución:');
      console.log('El Service Account no tiene permisos para listar dispositivos.');
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
    await listDevices();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
const { google } = require('googleapis');
require('dotenv').config();

async function updatePolicyForDeviceOwner() {
  const credentialsJson = Buffer.from(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 
    'base64'
  ).toString('utf8');
  
  const credentials = JSON.parse(credentialsJson);
  const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ['https://www.googleapis.com/auth/androidmanagement'],
  });

  const androidManagement = google.androidmanagement({
    version: 'v1',
    auth: auth,
  });

  const enterpriseName = process.env.ANDROID_ENTERPRISE_NAME;
  const policyName = `${enterpriseName}/policies/default`;

  console.log('📝 Configurando política para Device Owner...');
  console.log('Enterprise:', enterpriseName);
  console.log('Policy:', policyName);

  try {
    // ✅ PATCH para actualizar la política existente
    const policy = await androidManagement.enterprises.policies.patch({
      name: policyName,
      requestBody: {
        // ✅ MODO DE GOOGLE PLAY: Permitir apps normales
        playStoreMode: 'BLACKLIST',
        
        // ✅ DEBUGGING HABILITADO
        debuggingFeaturesAllowed: true,
        
        // ✅ APLICACIONES
        applications: [
          {
            packageName: 'com.solvenca.mdm',
            installType: 'FORCE_INSTALLED',
            lockTaskAllowed: true,
            defaultPermissionPolicy: 'GRANT',
            delegatedScopes: ['BLOCK_UNINSTALL'],
            // ✅ PERMISOS
            permissionGrants: [
              { permission: 'android.permission.ACCESS_FINE_LOCATION', policy: 'GRANT' },
              { permission: 'android.permission.ACCESS_COARSE_LOCATION', policy: 'GRANT' },
              { permission: 'android.permission.ACCESS_BACKGROUND_LOCATION', policy: 'GRANT' },
              { permission: 'android.permission.INTERNET', policy: 'GRANT' },
              { permission: 'android.permission.ACCESS_NETWORK_STATE', policy: 'GRANT' },
              { permission: 'android.permission.RECEIVE_BOOT_COMPLETED', policy: 'GRANT' },
              { permission: 'android.permission.FOREGROUND_SERVICE', policy: 'GRANT' },
              { permission: 'android.permission.FOREGROUND_SERVICE_LOCATION', policy: 'GRANT' },
              { permission: 'android.permission.READ_PHONE_STATE', policy: 'GRANT' }
            ]
          }
        ],
        
        // ✅ CONFIGURACIÓN DE REPORTES
        statusReportingSettings: {
          applicationReportsEnabled: true,
          deviceSettingsEnabled: true,
          softwareInfoEnabled: true,
          memoryInfoEnabled: true,
          networkInfoEnabled: true,
          displayInfoEnabled: true,
          powerManagementEventsEnabled: true,
          hardwareStatusEnabled: true,
          systemPropertiesEnabled: true
        },
        
        // ✅ ACTUALIZACIONES DEL SISTEMA
        systemUpdate: {
          type: 'AUTOMATIC',
          startMinutes: 120,
          endMinutes: 300
        }
      }
    });

    console.log('\n✅ POLÍTICA ACTUALIZADA EXITOSAMENTE\n');
    console.log('📱 Configuración aplicada:');
    console.log('  • App se instalará automáticamente');
    console.log('  • App será Device Owner (CRÍTICO)');
    console.log('  • Google Play normal habilitado');
    console.log('  • Permisos otorgados automáticamente');
    console.log('  • Debugging habilitado\n');
    console.log('🔥 IMPORTANTE:');
    console.log('  1. Factory Reset al dispositivo');
    console.log('  2. Generar NUEVO QR desde panel web');
    console.log('  3. Escanear QR en pantalla de bienvenida (6 toques)');
    console.log('  4. Esperar instalación automática');
    console.log('  5. La app será Device Owner ✅\n');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response?.data) {
      console.error('Detalles:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

updatePolicyForDeviceOwner();
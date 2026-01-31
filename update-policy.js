const { google } = require('googleapis');
require('dotenv').config();

async function updatePolicy() {
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

  console.log('📝 Actualizando política con Device Owner:', policyName);

  try {
    const policy = await androidManagement.enterprises.policies.patch({
      name: policyName,
      updateMask: 'applications,debuggingFeaturesAllowed,playStoreMode,setupActions',
      requestBody: {
        // ✅ GOOGLE PLAY NORMAL
        playStoreMode: 'BLACKLIST',
        
        // ✅ DEBUGGING
        debuggingFeaturesAllowed: true,
        
        // ✅ SETUP ACTIONS: Instalar app como Device Admin
        setupActions: [
          {
            title: 'Configurando dispositivo',
            description: 'Instalando aplicación de gestión...',
            launchApp: {
              packageName: 'com.solvenca.mdm'
            }
          }
        ],
        
        // ✅ APLICACIÓN CON PERMISOS DE DEVICE ADMIN
        applications: [
          {
            packageName: 'com.solvenca.mdm',
            installType: 'FORCE_INSTALLED',
            lockTaskAllowed: true,
            defaultPermissionPolicy: 'GRANT',
            delegatedScopes: [
              'BLOCK_UNINSTALL',
              'CERT_INSTALL',
              'MANAGED_CONFIGURATIONS'
            ],
            // ✅ ESTO ES CRÍTICO
            managedConfiguration: {},
            permissionGrants: [
              {
                permission: 'android.permission.ACCESS_FINE_LOCATION',
                policy: 'GRANT'
              },
              {
                permission: 'android.permission.ACCESS_COARSE_LOCATION',
                policy: 'GRANT'
              },
              {
                permission: 'android.permission.ACCESS_BACKGROUND_LOCATION',
                policy: 'GRANT'
              },
              {
                permission: 'android.permission.INTERNET',
                policy: 'GRANT'
              },
              {
                permission: 'android.permission.ACCESS_NETWORK_STATE',
                policy: 'GRANT'
              },
              {
                permission: 'android.permission.RECEIVE_BOOT_COMPLETED',
                policy: 'GRANT'
              },
              {
                permission: 'android.permission.FOREGROUND_SERVICE',
                policy: 'GRANT'
              },
              {
                permission: 'android.permission.FOREGROUND_SERVICE_LOCATION',
                policy: 'GRANT'
              }
            ]
          }
        ]
      }
    });

    console.log('\n✅ Política actualizada con Device Owner!\n');
    console.log('⚠️  IMPORTANTE: Debes hacer FACTORY RESET y re-enrollar');
    console.log('El Device Owner solo se configura durante el enrollment inicial.\n');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response?.data) {
      console.error(JSON.stringify(error.response.data, null, 2));
    }
  }
}

updatePolicy();
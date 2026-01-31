const { google } = require('googleapis');
require('dotenv').config();

async function updatePolicy() {
  const credentialsJson = Buffer.from(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64,
    'base64'
  ).toString('utf8');

  const credentials = JSON.parse(credentialsJson);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidmanagement'],
  });

  const androidManagement = google.androidmanagement({
    version: 'v1',
    auth,
  });

  const enterpriseName = process.env.ANDROID_ENTERPRISE_NAME;
  const policyName = `${enterpriseName}/policies/default`;

  console.log('📝 Actualizando política REAL (modo fdlpro)');

  try {
    await androidManagement.enterprises.policies.patch({
      name: policyName,
      updateMask: 'applications,playStoreMode,debuggingFeaturesAllowed',
      requestBody: {
        // ✅ GOOGLE PLAY NORMAL
        playStoreMode: 'BLACKLIST',


        // ✅ TU APP
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

            permissionGrants: [
              { permission: 'android.permission.ACCESS_FINE_LOCATION', policy: 'GRANT' },
              { permission: 'android.permission.ACCESS_COARSE_LOCATION', policy: 'GRANT' },
              { permission: 'android.permission.ACCESS_BACKGROUND_LOCATION', policy: 'GRANT' },
              { permission: 'android.permission.INTERNET', policy: 'GRANT' },
              { permission: 'android.permission.ACCESS_NETWORK_STATE', policy: 'GRANT' },
              { permission: 'android.permission.RECEIVE_BOOT_COMPLETED', policy: 'GRANT' },
              { permission: 'android.permission.FOREGROUND_SERVICE', policy: 'GRANT' },
              { permission: 'android.permission.FOREGROUND_SERVICE_LOCATION', policy: 'GRANT' }
            ]
          }
        ]
      }
    });

    console.log('✅ Política aplicada correctamente');
    console.log('⚠️  HACER FACTORY RESET Y RE-ENROLLAR');

  } catch (e) {
    console.error('❌ ERROR:', e.message);
    if (e.response?.data) {
      console.error(JSON.stringify(e.response.data, null, 2));
    }
  }
}

updatePolicy();

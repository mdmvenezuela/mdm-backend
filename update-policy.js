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

  try {
    const policy = await androidManagement.enterprises.policies.patch({
      name: policyName,
      updateMask: 'applications',
      requestBody: {
        applications: [
          {
            packageName: 'com.solvenca.mdm',
            installType: 'FORCE_INSTALLED',
            defaultPermissionPolicy: 'GRANT',
            lockTaskAllowed: true,
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
              }
            ]
          }
        ]
      }
    });

    console.log('✅ Política actualizada exitosamente:');
    console.log(JSON.stringify(policy.data, null, 2));
  } catch (error) {
    console.error('❌ Error actualizando política:', error.message);
    console.error(error.response?.data || error);
  }
}

updatePolicy();
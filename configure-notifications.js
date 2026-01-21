require('dotenv').config();
const { google } = require('googleapis');

async function configureNotifications() {
  try {
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
    const pubsubTopic = `projects/${credentials.project_id}/topics/android-management-events`;

    // Actualizar enterprise con el topic de Pub/Sub
    const result = await androidManagement.enterprises.patch({
      name: enterpriseName,
      updateMask: 'pubsubTopic',
      requestBody: {
        pubsubTopic: pubsubTopic,
        enabledNotificationTypes: [
          'ENROLLMENT',
          'COMPLIANCE_REPORT',
          'STATUS_REPORT',
          'COMMAND',
          'USAGE_LOGS',
        ],
      },
    });

    console.log('✅ Notificaciones configuradas');
    console.log('Enterprise:', result.data.name);
    console.log('Pub/Sub Topic:', result.data.pubsubTopic);
    console.log('Tipos habilitados:', result.data.enabledNotificationTypes);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Detalles:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

configureNotifications();
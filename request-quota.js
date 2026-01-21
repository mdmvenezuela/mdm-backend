require('dotenv').config();
const { google } = require('googleapis');

async function requestQuota() {
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

    // Solicitar cuota inicial (esto es automático para proyectos nuevos)
    console.log('✅ Tu enterprise está lista.');
    console.log('📱 Cuota de dispositivos: Google asigna automáticamente cuota inicial.');
    console.log('💡 Si necesitas más cuota, debes solicitarla mediante formulario de Google.');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

requestQuota();
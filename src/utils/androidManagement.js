require('dotenv').config();
const { google } = require('googleapis');

let androidManagement = null;

async function initAndroidManagement() {
  if (androidManagement) return androidManagement;

  const credentialsJson = Buffer.from(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 
    'base64'
  ).toString('utf8');
  
  const credentials = JSON.parse(credentialsJson);
  
  const auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ['https://www.googleapis.com/auth/androidmanagement'],
  });

  androidManagement = google.androidmanagement({
    version: 'v1',
    auth: auth,
  });

  return androidManagement;
}



module.exports = {
  initAndroidManagement,
  createEnrollmentToken,
};
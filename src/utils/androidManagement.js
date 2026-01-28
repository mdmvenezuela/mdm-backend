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

async function createEnrollmentToken(policyName = null) {
  const api = await initAndroidManagement();
  const enterpriseName = process.env.ANDROID_ENTERPRISE_NAME;

  // Si no se especifica política, usar la default
  const policy = policyName || `${enterpriseName}/policies/default`;

  const requestBody = {
    duration: '86400s', // 24 horas
    policyName: policy,
  };

  const result = await api.enterprises.enrollmentTokens.create({
    parent: enterpriseName,
    requestBody: requestBody,
  });

  return result.data;
}

module.exports = {
  initAndroidManagement,
  createEnrollmentToken,
};
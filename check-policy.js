const { google } = require('googleapis');
require('dotenv').config();

async function checkPolicy() {
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
    const response = await androidManagement.enterprises.policies.get({
      name: policyName
    });

    console.log('📋 POLÍTICA ACTUAL:');
    console.log(JSON.stringify(response.data, null, 2));
    
    console.log('\n🔍 VERIFICACIONES:');
    console.log('debuggingFeaturesAllowed:', response.data.debuggingFeaturesAllowed);
    console.log('applications:', response.data.applications?.length || 0);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkPolicy();
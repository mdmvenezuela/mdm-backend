const { google } = require('googleapis');
require('dotenv').config();

async function getPolicy() {
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
  const policyName = `${enterpriseName}/policies/default`; // o el nombre de tu policy

  const res = await androidManagement.enterprises.policies.get({
    name: policyName,
  });

  const device = await androidManagement.enterprises.devices.get({
  name: `enterprises/LC01l2uql7/policies/default`
});

  console.log(res.data);
}

getPolicy();

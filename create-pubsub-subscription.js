require('dotenv').config();
const { PubSub } = require('@google-cloud/pubsub');

async function createSubscription() {
  try {
    const credentialsJson = Buffer.from(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 
      'base64'
    ).toString('utf8');
    
    const credentials = JSON.parse(credentialsJson);
    
    const pubsub = new PubSub({
      projectId: 'smdm-484515',
      credentials: credentials,
    });

    const topicName = 'android-management-events';
    const subscriptionName = 'android-management-subscription';
    
    // URL de tu backend en Railway
    const pushEndpoint = 'https://app.solvenca.lat/api/webhook/pubsub';

    console.log(`Creando suscripción push a: ${pushEndpoint}`);

    const [subscription] = await pubsub
      .topic(topicName)
      .createSubscription(subscriptionName, {
        pushConfig: {
          pushEndpoint: pushEndpoint,
        },
      });

    console.log(`✅ Suscripción creada: ${subscription.name}`);
    console.log(`📨 Las notificaciones se enviarán a: ${pushEndpoint}`);
    
  } catch (error) {
    if (error.code === 6) {
      console.log('ℹ️  La suscripción ya existe');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

createSubscription();
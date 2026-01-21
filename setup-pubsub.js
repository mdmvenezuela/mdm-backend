require('dotenv').config();
const { google } = require('googleapis');
const { PubSub } = require('@google-cloud/pubsub');

async function setupPubSub() {
  try {
    const credentialsJson = Buffer.from(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 
      'base64'
    ).toString('utf8');
    
    const credentials = JSON.parse(credentialsJson);
    
    const pubsub = new PubSub({
      projectId: credentials.project_id,
      credentials: credentials
    });

    const topicName = 'android-management-events';
    const subscriptionName = 'mdm-backend-subscription';

    // Crear Topic
    try {
      const [topic] = await pubsub.createTopic(topicName);
      console.log(`✅ Topic creado: ${topic.name}`);
    } catch (error) {
      if (error.code === 6) { // Already exists
        console.log(`✓ Topic ya existe: projects/${credentials.project_id}/topics/${topicName}`);
      } else {
        throw error;
      }
    }

    // Crear Subscription
    const webhookUrl = process.env.WEBHOOK_URL || 'https://tu-backend.railway.app/api/webhook/android-enterprise';
    
    try {
      const [subscription] = await pubsub
        .topic(topicName)
        .createSubscription(subscriptionName, {
          pushConfig: {
            pushEndpoint: webhookUrl,
          },
        });
      console.log(`✅ Subscription creada: ${subscription.name}`);
      console.log(`📡 Webhook URL: ${webhookUrl}`);
    } catch (error) {
      if (error.code === 6) {
        console.log(`✓ Subscription ya existe: projects/${credentials.project_id}/subscriptions/${subscriptionName}`);
      } else {
        throw error;
      }
    }

    console.log('\n🎉 Pub/Sub configurado correctamente');
    console.log('\n📋 SIGUIENTE PASO:');
    console.log('1. Agrega esta variable a Railway:');
    console.log(`   PUBSUB_TOPIC=projects/${credentials.project_id}/topics/${topicName}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

setupPubSub();
const express = require('express');
const cors = require('cors');
const path = require('path');
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const authRoutes = require('./routes/authRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const resellerRoutes = require('./routes/resellerRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const migrate = require('./database/migrate');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ⭐ AGREGAR ESTO ⭐
// Servir archivos estáticos para el APK
app.use('/apk', express.static(path.join(__dirname, '../public/apk')));


// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.get('/', (req, res) => {
  res.status(200).send('MDM Backend Online');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'MDM Server running' });
});

// Endpoint de debug
app.get('/debug/qr/:resellerId', async (req, res) => {
  const { resellerId } = req.params;
  
  const APK_URL = process.env.APK_URL || "URL_NO_CONFIGURADA";
  const SERVER_URL = process.env.SERVER_URL || "URL_NO_CONFIGURADA";
  
  res.json({
    apk_url: APK_URL,
    server_url: SERVER_URL,
    reseller_id: resellerId,
    qr_data_preview: {
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME": "com.tecnoca.mdm/.DeviceAdminReceiver",
      "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION": APK_URL,
      "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": false,
      "android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED": true,
      "android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE": {
        "enrollment_token": "PREVIEW_TOKEN",
        "server_url": SERVER_URL,
        "reseller_id": parseInt(resellerId)
      }
    }
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', superAdminRoutes);
app.use('/api/reseller', resellerRoutes);
app.use('/api/device', deviceRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

(async () => {
  try {
    await migrate();
    console.log('🧱 Base de datos lista');
  } catch (error) {
    console.error('🚨 Error preparando la base de datos:', error);
    process.exit(1);
  }
})();

app.listen(PORT, '0.0.0.0', () => {  // ⭐ Agregar '0.0.0.0'
  console.log(`
  ╔══════════════════════════════════════╗
  ║   🚀 MDM Server Started              ║
  ║   📡 Port: ${PORT}                     ║
  ║   🌍 Host: 0.0.0.0                   ║
  ║   🌍 Environment: ${process.env.NODE_ENV || 'development'}       ║
  ╚══════════════════════════════════════╝
  `);
});

module.exports = app;
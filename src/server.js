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
const webhookRoutes = require('./routes/webhook');
const contactRoutes = require('./routes/contact-resend');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ⭐ AGREGAR ESTO ⭐
// Servir la carpeta public
app.use('/public', express.static(path.join(__dirname, 'public')));

app.use('/apk', express.static(path.join(__dirname, '../public/apk')));

app.use('/api/webhook', webhookRoutes);

app.get('/apk/mdm.apk', (req, res) => {
  const apkPath = path.join(__dirname, '..', 'public', 'apk', 'mdm.apk'); // <-- subir un nivel
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');

  res.sendFile(apkPath, (err) => {
    if (err) {
      console.error('Error enviando APK:', err);
      res.status(500).send('No se pudo descargar el APK');
    }
  });
});

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

// formulario de contacto
app.use('/api', contactRoutes);


//temporal para push/sub
app.post('/api/webhook/android-enterpris', (req, res) => {
  console.log('Webhook recibido');
  res.sendStatus(200);
});

const policyRoutes = require('./routes/policies');
app.use('/api', policyRoutes);

// ✅ NUEVO: Servir archivos estáticos (APK)
app.use('/downloads', express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.apk')) {
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', 'attachment; filename="mdm-device-manager.apk"');
    }
  }
}));

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
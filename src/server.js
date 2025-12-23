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
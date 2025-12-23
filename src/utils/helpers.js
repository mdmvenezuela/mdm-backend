const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Hash de contraseña
const hashPassword = async (password) => {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
};

// Comparar contraseña
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Generar JWT
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// Generar license key única
const generateLicenseKey = () => {
  return `LIC-${uuidv4().toUpperCase().substring(0, 18)}`;
};

// Generar token de enrolamiento
const generateEnrollmentToken = () => {
  return `ENR-${uuidv4()}`;
};

// Generar QR code
const generateQRCode = async (data) => {
  try {
    return await QRCode.toDataURL(JSON.stringify(data));
  } catch (err) {
    throw new Error('Error generando QR code');
  }
};

// Generar checksum SHA-256 del APK
const generateAPKChecksum = () => {
  const apkPath = path.resolve(__dirname, '../../public/apk/mdm.apk');

  if (!fs.existsSync(apkPath)) {
    throw new Error('APK no encontrado para generar checksum');
  }

  const fileBuffer = fs.readFileSync(apkPath);

  return crypto
    .createHash('sha256')
    .update(fileBuffer)
    .digest('base64'); // 👈 OBLIGATORIO
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  generateLicenseKey,
  generateEnrollmentToken,
  generateQRCode,
  generateAPKChecksum
};

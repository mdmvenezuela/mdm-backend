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

const getAPKChecksum = () => {
  if (!process.env.APK_CHECKSUM) {
    throw new Error('APK_CHECKSUM no configurado');
  }
  return process.env.APK_CHECKSUM;
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  generateLicenseKey,
  generateEnrollmentToken,
  generateQRCode,
  getAPKChecksum
};

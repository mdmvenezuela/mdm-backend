const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }
    req.user = user;
    next();
  });
};

const isSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Acceso denegado. Solo Super Admin' });
  }
  next();
};

const isReseller = (req, res, next) => {
  if (req.user.role !== 'reseller') {
    return res.status(403).json({ error: 'Acceso denegado. Solo Resellers' });
  }
  next();
};

module.exports = { authenticateToken, isSuperAdmin, isReseller };
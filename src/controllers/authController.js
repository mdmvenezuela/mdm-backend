const pool = require('../config/database');
const { comparePassword, generateToken } = require('../utils/helpers');

// Login Super Admin
exports.loginSuperAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const result = await pool.query(
      'SELECT * FROM super_admins WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const admin = result.rows[0];
    const validPassword = await comparePassword(password, admin.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = generateToken({
      id: admin.id,
      username: admin.username,
      role: 'super_admin'
    });

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: 'super_admin'
      }
    });
  } catch (error) {
    console.error('Error en login super admin:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};

// Login Reseller
exports.loginReseller = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const result = await pool.query(
      'SELECT * FROM resellers WHERE username = $1 AND is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas o cuenta inactiva' });
    }

    const reseller = result.rows[0];
    const validPassword = await comparePassword(password, reseller.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = generateToken({
      id: reseller.id,
      username: reseller.username,
      role: 'reseller'
    });

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: reseller.id,
        username: reseller.username,
        business_name: reseller.business_name,
        email: reseller.email,
        role: 'reseller'
      }
    });
  } catch (error) {
    console.error('Error en login reseller:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};
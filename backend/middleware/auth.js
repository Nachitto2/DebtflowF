const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'clave_desarrollo_local');
    
    // Consultamos el usuario en SQLite para tener sus datos y rol actualizados
    const db = await getDb();
    const user = await db.get('SELECT id, email, role, plan FROM users WHERE id = ?', [payload.sub]);

    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso solo para administradores' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = issueToken(user);
    // Removemos el hash antes de enviarlo al front
    delete user.password_hash;
    res.json({ token, user });
  } catch (err) { next(err); }
});

router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || password?.length < 8) {
      return res.status(400).json({ error: 'Datos inválidos (password min 8 caracteres)' });
    }

    const db = await getDb();
    const existente = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existente) return res.status(400).json({ error: 'El email ya está registrado' });

    const hash = await bcrypt.hash(password, 10);
    const userId = 'usr_' + Date.now();

    await db.run(
      'INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)',
      [userId, email, hash]
    );

    const newUser = await db.get('SELECT id, email, role, plan, twilio_phone_number FROM users WHERE id = ?', [userId]);
    const token = issueToken(newUser);
    res.status(201).json({ token, user: newUser });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const db = await getDb();
    const user = await db.get('SELECT id, email, role, plan, twilio_phone_number FROM users WHERE id = ?', [req.user.id]);
    res.json(user);
  } catch (err) { next(err); }
});

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET || 'clave_desarrollo_local', { expiresIn: '7d' });
}

module.exports = router;
const router = require('express').Router();
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getDb } = require('../db/database');

router.use(requireAuth, requireAdmin);

// GET /api/admin/users — todos los usuarios
router.get('/users', async (req, res, next) => {
  try {
    const db = await getDb();
    const users = await db.all(
      'SELECT id, email, role, plan, twilio_phone_number, vapi_assistant_id, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (e) { next(e); }
});

// GET /api/admin/stats — métricas globales
router.get('/stats', async (req, res, next) => {
  try {
    const db = await getDb();
    const [users, deudores, llamadas] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM users'),
      db.get('SELECT COUNT(*) as count FROM deudores'),
      db.get('SELECT COUNT(*) as count FROM llamadas'),
    ]);
    res.json({
      totalUsuarios: users?.count || 0,
      totalDeudores: deudores?.count || 0,
      totalLlamadas: llamadas?.count || 0,
    });
  } catch (e) { next(e); }
});

// GET /api/admin/llamadas — todas las llamadas globales con sus relaciones
router.get('/llamadas', async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.all(`
      SELECT l.id, l.resultado, l.sentimiento, l.duracion_seg, l.nota, l.iniciada_at,
             d.nombre as deudor_nombre, d.tel as deudor_tel,
             u.email as user_email
      FROM llamadas l
      LEFT JOIN deudores d ON l.deudor_id = d.id
      LEFT JOIN users u ON l.user_id = u.id
      ORDER BY l.iniciada_at DESC
      LIMIT 500
    `);

    // Anidar objetos para respetar estrictamente la estructura del frontend
    const formatted = rows.map(r => ({
      id: r.id,
      resultado: r.resultado,
      sentimiento: r.sentimiento,
      duracion_seg: r.duracion_seg,
      nota: r.nota,
      iniciada_at: r.iniciada_at,
      deudores: {
        nombre: r.deudor_nombre,
        tel: r.deudor_tel
      },
      users: {
        email: r.user_email
      }
    }));
    res.json(formatted);
  } catch (e) { next(e); }
});

// PUT /api/admin/users/:id/plan — cambiar plan de un usuario
router.put('/users/:id/plan', async (req, res, next) => {
  try {
    const { plan } = req.body;
    const valid = ['trial','silver','gold','enterprise'];
    if (!valid.includes(plan))
      return res.status(400).json({ error: 'Plan inválido' });

    const db = await getDb();
    await db.run('UPDATE users SET plan = ? WHERE id = ?', [plan, req.params.id]);
    const updated = await db.get(
      'SELECT id, email, role, plan, twilio_phone_number, vapi_assistant_id, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    res.json(updated);
  } catch (e) { next(e); }
});

// PUT /api/admin/users/:id/role — promover/degradar usuario
router.put('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['user','admin'].includes(role))
      return res.status(400).json({ error: 'Rol inválido' });

    const db = await getDb();
    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    const updated = await db.get(
      'SELECT id, email, role, plan, twilio_phone_number, vapi_assistant_id, created_at FROM users WHERE id = ?',
      [req.params.id]
    );
    res.json(updated);
  } catch (e) { next(e); }
});

module.exports = router;
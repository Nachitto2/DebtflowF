const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');

router.use(requireAuth);

const ALLOWED = ['nombre','tel','monto','acreedor','estado','llamar_auto','frecuencia','hora','dias_semana','max_intentos','notas'];

router.get('/', async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT * FROM deudores WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    // Parsear el array JSON de días para el frontend
    const data = rows.map(r => ({
      ...r,
      llamar_auto: Boolean(r.llamar_auto),
      dias_semana: r.dias_semana ? JSON.parse(r.dias_semana) : []
    }));
    res.json(data);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const body = pick(req.body, ALLOWED);
    if (!body.nombre || !body.tel || !body.monto) return res.status(400).json({ error: 'Faltan campos obligatorios' });

    const db = await getDb();
    const id = 'deu_' + Date.now();
    const diasStr = JSON.stringify(body.dias_semana || []);

    await db.run(`INSERT INTO deudores (id, user_id, nombre, tel, monto, acreedor, estado, llamar_auto, frecuencia, hora, dias_semana)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, body.nombre, body.tel, Number(body.monto), body.acreedor, body.estado || 'pendiente', body.llamar_auto ? 1 : 0, body.frecuencia, body.hora, diasStr]
    );
    const nuevo = await db.get('SELECT * FROM deudores WHERE id = ?', [id]);
    res.status(201).json({ ...nuevo, llamar_auto: Boolean(nuevo.llamar_auto), dias_semana: JSON.parse(nuevo.dias_semana) });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const db = await getDb();
    await db.run('DELETE FROM deudores WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

const pick = (obj, keys) => Object.fromEntries(keys.filter(k => k in obj).map(k => [k, obj[k]]));
module.exports = router;
const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const db = await getDb();
    // Hacemos un JOIN SQL plano para traer el nombre y teléfono del deudor
    const rows = await db.all(`
      SELECT l.*, d.nombre as deudor_nombre, d.tel as deudor_tel 
      FROM llamadas l 
      LEFT JOIN deudores d ON l.deudor_id = d.id 
      WHERE l.user_id = ? 
      ORDER BY l.iniciada_at DESC LIMIT 200
    `, [req.user.id]);

    const formatted = rows.map(l => ({
      id: l.id,
      deudor: l.deudor_nombre || '—',
      tel: l.deudor_tel || '—',
      fecha: l.iniciada_at ? new Date(l.iniciada_at).toLocaleString('es-AR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—',
      dur: l.duracion_seg ? `${Math.floor(l.duracion_seg/60)}m ${l.duracion_seg%60}s` : '—',
      resultado: l.resultado || 'no_contesta',
      sentimiento: l.sentimiento || 'neutro',
      nota: l.nota || '',
      transcripcion: l.transcripcion ? JSON.parse(l.transcripcion) : []
    }));

    res.json(formatted);
  } catch (e) { next(e); }
});

module.exports = router;
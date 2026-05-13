const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../db/database');
const vapiSvc = require('../services/vapi');

router.use(requireAuth);

const ALLOWED = [
  'nombre','tono','voz','idioma','modelo',
  'personalidad','saludo','objecion','cierre',
];

// GET /api/agente
router.get('/', async (req, res, next) => {
  try {
    const db = await getDb();
    const user = await db.get(
      'SELECT agente_config, vapi_assistant_id, twilio_phone_number FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    let agente_config = {};
    try {
      agente_config = user.agente_config ? JSON.parse(user.agente_config) : {};
    } catch {
      agente_config = {};
    }

    res.json({
      agente_config,
      vapi_assistant_id: user.vapi_assistant_id,
      twilio_phone_number: user.twilio_phone_number
    });
  } catch (e) { next(e); }
});

// PUT /api/agente
router.put('/', async (req, res, next) => {
  try {
    const config = Object.fromEntries(
      ALLOWED.filter(k => k in req.body).map(k => [k, req.body[k]])
    );

    const db = await getDb();
    const configStr = JSON.stringify(config);

    // Guardar en la columna nativa
    await db.run('UPDATE users SET agente_config = ? WHERE id = ?', [configStr, req.user.id]);

    const user = await db.get('SELECT vapi_assistant_id FROM users WHERE id = ?', [req.user.id]);

    // Intentar propagar cambios al servicio de voz si estuviera configurado
    if (user?.vapi_assistant_id) {
      vapiSvc.updateAssistant(user.vapi_assistant_id, config).catch(() => {});
    }

    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
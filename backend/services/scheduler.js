const cron = require('node-cron');
const { getDb } = require('../db/database');
const vapiSvc = require('./vapi');
const logger = require('../utils/logger');

// Frecuencia → minutos mínimos entre intentos
const FREQ_MIN = {
  diaria: 1440,
  cada2dias: 2880,
  cada3dias: 4320,
  semanal: 10080,
  quincenal: 21600,
  mensual: 43200,
};

// Nombre del día → número JS (0=domingo)
const DIA_NUM = { dom: 0, lun: 1, mar: 2, mié: 3, jue: 4, vie: 5, sáb: 6 };

function init() {
  // Corre cada minuto
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const hhmm = now.toTimeString().slice(0, 5); // "10:00"
    const dowNum = now.getDay();
    const dowKey = Object.keys(DIA_NUM).find(k => DIA_NUM[k] === dowNum);

    try {
      const db = await getDb();
      
      // Traer deudores con llamarAuto activo (1 en SQLite) haciendo INNER JOIN con la tabla users
      const deudores = await db.all(`
        SELECT d.*, u.twilio_phone_number, u.vapi_assistant_id, u.agente_config, u.plan
        FROM deudores d
        INNER JOIN users u ON d.user_id = u.id
        WHERE d.llamar_auto = 1 AND d.estado != 'cancelado'
      `);

      if (!deudores?.length) return;

      for (const d of deudores) {
        try {
          // Parsear de forma segura el JSON de días almacenado en texto plano
          let diasSemana = [];
          try {
            diasSemana = d.dias_semana ? JSON.parse(d.dias_semana) : [];
          } catch {
            diasSemana = [];
          }

          if (!shouldCall(d, hhmm, dowKey, now, diasSemana)) continue;

          // Verificar límite de intentos
          const maxIntentos = d.max_intentos ?? 3;
          if (d.intentos >= maxIntentos) {
            logger.info(`Deudor ${d.id} alcanzó el límite de ${maxIntentos} intentos, desactivando auto-llamada`);
            await db.run('UPDATE deudores SET llamar_auto = 0 WHERE id = ?', [d.id]);
            continue;
          }

          if (!d.vapi_assistant_id || !d.twilio_phone_number) {
            logger.warn(`Usuario sin Twilio/Vapi configurado: ${d.user_id}`);
            continue;
          }

          logger.info(`Llamando a ${d.nombre} (${d.tel})`);

          // Consumir el servicio simulado de voz
          const call = await vapiSvc.makeCall({
            assistantId: d.vapi_assistant_id,
            toNumber: d.tel,
            fromNumber: d.twilio_phone_number,
            metadata: {
              nombre_deudor: d.nombre,
              acreedor: d.acreedor || '',
              monto: d.monto,
              deudor_id: d.id,
              user_id: d.user_id,
            },
          });

          const llamadaId = 'call_' + Date.now();
          await db.run(
            `INSERT INTO llamadas (id, user_id, deudor_id, resultado) VALUES (?, ?, ?, ?)`,
            [llamadaId, d.user_id, d.id, 'contactado'] // Insertamos un resultado simulado por defecto
          );

          // Actualizar intentos
          await db.run(
            'UPDATE deudores SET intentos = intentos + 1, ultimo_intento = ? WHERE id = ?',
            [now.toISOString(), d.id]
          );

        } catch (callErr) {
          logger.error(`Error al llamar a deudor ${d.id}: ${callErr.message}`);
        }
      }
    } catch (err) {
      logger.error('Scheduler error general: ' + err.message);
    }
  });

  logger.info('Scheduler local iniciado exitosamente');
}

function shouldCall(d, hhmm, dowKey, now, diasSemana) {
  if (!d.hora) return false;
  const deudorHora = d.hora.slice(0, 5);
  if (deudorHora !== hhmm) return false;
  if (!diasSemana.includes(dowKey)) return false;
  
  if (d.ultimo_intento) {
    const minsSince = (now - new Date(d.ultimo_intento)) / 60000;
    const minRequired = FREQ_MIN[d.frecuencia] || 1440;
    if (minsSince < minRequired) return false;
  }
  return true;
}

module.exports = { init };
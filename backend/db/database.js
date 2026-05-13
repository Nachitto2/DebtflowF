const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

let dbInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;
  dbInstance = await open({
    filename: path.join(__dirname, 'debtflow.sqlite'),
    driver: sqlite3.Database
  });
  await initDb(dbInstance);
  return dbInstance;
}

async function initDb(db) {
  // Crear tablas
  await db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, 
  email TEXT UNIQUE NOT NULL, 
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user', 
  plan TEXT DEFAULT 'trial', 
  twilio_phone_number TEXT,
  vapi_assistant_id TEXT,
  agente_config TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
    CREATE TABLE IF NOT EXISTS deudores (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, nombre TEXT NOT NULL, tel TEXT NOT NULL,
      monto REAL NOT NULL, acreedor TEXT, estado TEXT DEFAULT 'pendiente',
      llamar_auto INTEGER DEFAULT 0, frecuencia TEXT, hora TEXT, dias_semana TEXT,
      max_intentos INTEGER DEFAULT 3, notas TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS llamadas (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, deudor_id TEXT, resultado TEXT,
      sentimiento TEXT, duracion_seg INTEGER, transcripcion TEXT, nota TEXT,
      iniciada_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Crear usuario de prueba por defecto si no existe
  const adminEmail = 'admin@debtflow.com';
  const user = await db.get('SELECT id FROM users WHERE email = ?', [adminEmail]);
  
  if (!user) {
    console.log('Poblando base de datos con datos mock iniciales...');
    const hash = await bcrypt.hash('admin1234', 10);
    const userId = 'usr_demo_100';
    await db.run('INSERT INTO users (id, email, password_hash, role, plan, twilio_phone_number) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, adminEmail, hash, 'admin', 'silver', '+54 9 11 5555-4444']);

    // ─── INSERTAR DEUDORES MOCK ───
    const deudoresMock = [
      { id: 'd1', n: 'Carlos Méndez', t: '+54 9 11 4523-7890', m: 45000, ac: 'Banco Patagonia', est: 'pendiente', auto: 1, frec: 'semanal', dias: '["lun","jue"]' },
      { id: 'd2', n: 'Ana Rodríguez', t: '+54 9 351 6234-1234', m: 12300, ac: 'FinanCo S.A.', est: 'contactado', auto: 1, frec: 'cada2dias', dias: '["lun","mar","vie"]' },
      { id: 'd3', n: 'Martín López', t: '+54 9 261 7890-5678', m: 89750, ac: 'Banco Patagonia', est: 'promesa_pago', auto: 0, frec: '', dias: '[]' },
      { id: 'd4', n: 'Roberto Silva', t: '+54 9 341 4567-8901', m: 67400, ac: 'FinanCo S.A.', est: 'cancelado', auto: 0, frec: '', dias: '[]' }
    ];

    for (const d of deudoresMock) {
      await db.run(`INSERT INTO deudores (id, user_id, nombre, tel, monto, acreedor, estado, llamar_auto, frecuencia, dias_semana) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [d.id, userId, d.n, d.t, d.m, d.ac, d.est, d.auto, d.frec, d.dias]);
    }

    // ─── INSERTAR LLAMADAS MOCK (CON TRANSCRIPCIÓN JSON) ───
    const t1 = JSON.stringify([
      { quien: 'agente', texto: 'Buenos días, ¿hablo con Ana Rodríguez? Le llamo de FinanCo.' },
      { quien: 'deudor', texto: 'Sí, soy yo. Pensé pagar el viernes, ¿está bien?' },
      { quien: 'agente', texto: 'Perfecto, registramos el acuerdo para el viernes.' }
    ]);
    await db.run(`INSERT INTO llamadas (id, user_id, deudor_id, resultado, sentimiento, duracion_seg, transcripcion, nota)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, ['l1', userId, 'd2', 'contactado', 'positivo', 185, t1, 'Prometió pagar el viernes']);

    const t2 = JSON.stringify([
      { quien: 'agente', texto: 'Buenos días, le llamo de Banco Patagonia...' },
      { quien: 'agente', texto: '[Buzón de voz — llamada finalizada]' }
    ]);
    await db.run(`INSERT INTO llamadas (id, user_id, deudor_id, resultado, sentimiento, duracion_seg, transcripcion, nota)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, ['l2', userId, 'd1', 'no_contesta', 'neutro', 15, t2, 'Buzón de voz directo']);
  }
}

module.exports = { getDb };
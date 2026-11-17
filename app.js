const express = require('express');
const pool = require('./db');

const app = express();

// Express 5 envía al manejador de errores (al final del archivo) cualquier consulta que falle
// dentro de una ruta async, así que las rutas no necesitan try/catch.

// Pistas para los errores de conexión más comunes con RDS.
const PISTAS = {
  ETIMEDOUT: 'No hay respuesta de RDS: revise que la instancia sea de acceso público y que su grupo de seguridad permita el puerto 3306.',
  ECONNREFUSED: 'La conexión fue rechazada: revise DB_HOST y DB_PORT.',
  ENOTFOUND: 'No existe ese servidor: revise que DB_HOST sea el punto de enlace de RDS.',
  ER_ACCESS_DENIED_ERROR: 'Usuario o contraseña incorrectos: revise DB_USER y DB_PASSWORD.',
  ER_BAD_DB_ERROR: 'La base indicada en DB_NAME no existe en la instancia.',
  HANDSHAKE_SSL_ERROR: 'Falló la conexión cifrada: con RDS, actualice mysql2 (npm install mysql2@latest); con un MySQL local, use DB_SSL=false.',
};

function describirError(error) {
  return { error: error.message, codigo: error.code, pista: PISTAS[error.code] };
}

// Lista de rutas disponibles
app.get('/', (req, res) => {
  res.json({
    api: 'API de ejemplo - Bases de Datos II',
    rutas: [
      'GET /api/health',
      'GET /api/servidor',
      'GET /api/tablas',
      'GET /api/tablas/:nombre',
      'GET /api/tablas/:nombre/muestra?limite=5',
    ],
  });
});

// Estado de la API y de la conexión a RDS. Responde 200 si la base contesta y 503 si no.
app.get('/api/health', async (req, res) => {
  const inicio = Date.now();
  try {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok', base_de_datos: 'conectada', milisegundos: Date.now() - inicio });
  } catch (error) {
    res.status(503).json({ estado: 'error', base_de_datos: 'sin conexión', ...describirError(error) });
  }
});

// Datos del servidor MySQL: sirve para comprobar los parámetros configurados en RDS.
app.get('/api/servidor', async (req, res) => {
  const [filas] = await pool.query(`
    SELECT @@hostname              AS servidor,
           VERSION()               AS version,
           DATABASE()              AS base_actual,
           @@global.time_zone      AS zona_horaria_global,
           @@session.time_zone     AS zona_horaria_sesion,
           NOW()                   AS hora_local,
           UTC_TIMESTAMP()         AS hora_utc,
           @@lower_case_table_names AS lower_case_table_names,
           @@sql_mode              AS sql_mode`);
  res.json(filas[0]);
});

// Tablas de la base actual con su número exacto de filas.
// TABLE_ROWS de information_schema es solo una estimación de InnoDB, por eso se cuenta cada tabla con COUNT(*).
app.get('/api/tablas', async (req, res) => {
  const [tablas] = await pool.query(`
    SELECT TABLE_NAME AS tabla, TABLE_TYPE AS tipo
      FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
     ORDER BY TABLE_NAME`);
  for (const t of tablas) {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM ??', [t.tabla]);
    t.filas = total;
  }
  res.json(tablas);
});

// Valida el nombre recibido en la URL y confirma que la tabla exista en la base actual.
// Responde 400 o 404 y devuelve null si no se puede continuar.
async function buscarTabla(req, res) {
  const nombre = req.params.nombre;
  if (!/^[A-Za-z0-9_]{1,64}$/.test(nombre)) {
    res.status(400).json({ error: 'Nombre de tabla no válido: use solo letras, números y guion bajo.' });
    return null;
  }
  // El valor viaja como parámetro (?), nunca concatenado en el texto de la consulta.
  const [filas] = await pool.query(
    `SELECT TABLE_NAME AS tabla
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [nombre],
  );
  if (filas.length === 0) {
    res.status(404).json({ error: `No existe la tabla '${nombre}' en la base actual.` });
    return null;
  }
  return filas[0].tabla;
}

// Columnas de una tabla.
app.get('/api/tablas/:nombre', async (req, res) => {
  const tabla = await buscarTabla(req, res);
  if (!tabla) return;
  const [columnas] = await pool.query(
    `SELECT COLUMN_NAME AS columna, COLUMN_TYPE AS tipo, IS_NULLABLE AS admite_nulos, COLUMN_KEY AS llave
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [tabla],
  );
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM ??', [tabla]);
  res.json({ tabla, total_filas: total, columnas });
});

// Primeras filas de una tabla. ?limite=N, entre 1 y 50; si no se envía, 5.
app.get('/api/tablas/:nombre/muestra', async (req, res) => {
  const texto = req.query.limite ?? '5';
  if (!/^\d+$/.test(texto) || Number(texto) < 1 || Number(texto) > 50) {
    return res.status(400).json({ error: 'El parámetro limite debe ser un entero entre 1 y 50.' });
  }
  const tabla = await buscarTabla(req, res);
  if (!tabla) return;
  // ?? escapa un nombre de tabla o columna; ? escapa un valor.
  const [filas] = await pool.query('SELECT * FROM ?? LIMIT ?', [tabla, Number(texto)]);
  res.json({ tabla, limite: Number(texto), filas });
});

// Cualquier otra ruta
app.use((req, res) => {
  res.status(404).json({ error: `No existe la ruta ${req.method} ${req.path}` });
});

// Errores no previstos: se registran en la consola (docker logs) y se responde 500 en JSON.
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json(describirError(error));
});

module.exports = app;

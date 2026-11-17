const mysql = require('mysql2/promise');

// Las credenciales vienen de variables de entorno: del archivo .env en su equipo o en la EC2,
// o de la configuración del servicio en AWS. Nunca se escriben en el código.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'dw_ventas',
  // Conexión cifrada con los certificados de RDS. Para un MySQL local sin TLS use DB_SSL=false.
  ssl: process.env.DB_SSL === 'false' ? undefined : 'Amazon RDS',
  // Fechas tal como las devuelve MySQL ("2026-11-16 10:30:00"), sin convertirlas a la zona del servidor de la API.
  dateStrings: true,
  connectTimeout: 5000,
  waitForConnections: true,
  connectionLimit: 3,
});

module.exports = pool;

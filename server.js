require('dotenv').config({ quiet: true }); // lee el archivo .env si existe; con Docker las variables llegan por --env-file
const app = require('./app');
const pool = require('./db');

const puerto = Number(process.env.PORT || 3000);

// 0.0.0.0 y no localhost: así acepta conexiones desde fuera del contenedor o del servidor.
const servidor = app.listen(puerto, '0.0.0.0', () => {
  console.log(`API escuchando en el puerto ${puerto}`);
  console.log(`Base de datos: ${process.env.DB_HOST}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || 'dw_ventas'}`);
});

// docker stop envía SIGTERM: se cierran el servidor y las conexiones antes de salir.
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => {
    servidor.close(() => pool.end().finally(() => process.exit(0)));
  });
}

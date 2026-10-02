const env = require('./config/env');
const app = require('./app');
const { pool } = require('./db/pool');

const server = app.listen(env.PORT, () => {
  console.log(`API de Taller Digital escuchando en http://localhost:${env.PORT}/api`);
});

async function apagar(senal) {
  console.log(`${senal} recibido, cerrando...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));

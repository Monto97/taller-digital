/**
 * Migración para los datos de ejemplo que se cargan al registrarse.
 *   - Agrega clientes.es_ejemplo si no está.
 * Idempotente: se puede correr varias veces sin romper nada.
 *
 *   node scripts/migrar-ejemplos.js
 */
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

async function main() {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    socketPath: env.DB_SOCKET || undefined,
  });

  try {
    const [[{ existe }]] = await conn.query(
      `SELECT COUNT(*) AS existe FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'clientes' AND COLUMN_NAME = 'es_ejemplo'`,
      [env.DB_NAME],
    );
    if (existe) {
      console.log('OK: clientes.es_ejemplo ya existía.');
      return;
    }
    await conn.query(
      `ALTER TABLE clientes
         ADD COLUMN es_ejemplo TINYINT(1) NOT NULL DEFAULT 0
         COMMENT 'Cargado al registrarse para mostrar la app; se borra desde el tablero'
         AFTER notas`,
    );
    console.log('OK: columna clientes.es_ejemplo agregada.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('No se pudo migrar:', err.message);
  process.exit(1);
});

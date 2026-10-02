/**
 * Crea las tablas en la base configurada si todavía no existen.
 * Es seguro correrlo en cada arranque: si las tablas ya están, no hace nada.
 *
 *   node scripts/init-db.js
 */
const path = require('node:path');
const fs = require('node:fs');
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
    multipleStatements: true,
  });

  try {
    const [tablas] = await conn.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ? AND table_name = 'talleres'",
      [env.DB_NAME],
    );
    if (tablas[0].n > 0) {
      console.log(`La base "${env.DB_NAME}" ya tiene las tablas. No hay nada que hacer.`);
      return;
    }

    // El schema crea su propia base para desarrollo local; acá se usa la que da el hosting.
    const schema = fs
      .readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8')
      .replace(/^CREATE DATABASE[\s\S]*?;\s*$/m, '')
      .replace(/^USE \w+;\s*$/m, '');

    await conn.query(schema);
    console.log(`Tablas creadas en "${env.DB_NAME}".`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('No se pudo inicializar la base:', err.message);
  process.exit(1);
});

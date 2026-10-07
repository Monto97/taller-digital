/**
 * Migración para agregar la conexión de Mercado Pago.
 *   - Crea la tabla taller_mercadopago si no está.
 * Idempotente.
 *
 *   node scripts/migrar-mercadopago.js
 */
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

const CREAR_TABLA = `
CREATE TABLE IF NOT EXISTS taller_mercadopago (
  taller_id      INT UNSIGNED  NOT NULL,
  mp_user_id     VARCHAR(50)   NOT NULL,
  access_token   VARCHAR(500)  NOT NULL,
  refresh_token  VARCHAR(500)  NULL,
  public_key     VARCHAR(500)  NULL,
  live_mode      TINYINT(1)    NOT NULL DEFAULT 1,
  expires_at     DATETIME      NULL,
  conectado_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (taller_id),
  CONSTRAINT fk_mp_taller FOREIGN KEY (taller_id) REFERENCES talleres (id) ON DELETE CASCADE
) ENGINE=InnoDB
`;

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
    await conn.query(CREAR_TABLA);
    console.log('OK: tabla taller_mercadopago lista.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('No se pudo migrar:', err.message);
  process.exit(1);
});

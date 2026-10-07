/**
 * Migración para la Orders API de Mercado Pago.
 *   - Crea la tabla orden_pagos_mp si no está.
 * Idempotente.
 *
 *   node scripts/migrar-mp-orders.js
 */
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

const CREAR_TABLA = `
CREATE TABLE IF NOT EXISTS orden_pagos_mp (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  taller_id           INT UNSIGNED  NOT NULL,
  orden_id            INT UNSIGNED  NOT NULL,
  mp_order_id         VARCHAR(60)   NOT NULL,
  external_reference  VARCHAR(80)   NOT NULL,
  monto               DECIMAL(12,2) NOT NULL,
  checkout_url        VARCHAR(500)  NULL,
  estado              VARCHAR(30)   NOT NULL DEFAULT 'created',
  pago_id             INT UNSIGNED  NULL,
  pagado_at           DATETIME      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mp_order_id (mp_order_id),
  KEY idx_mp_orden (orden_id, created_at),
  KEY idx_mp_ref (external_reference),
  CONSTRAINT fk_mpord_taller FOREIGN KEY (taller_id) REFERENCES talleres (id),
  CONSTRAINT fk_mpord_orden  FOREIGN KEY (orden_id)  REFERENCES ordenes (id) ON DELETE CASCADE,
  CONSTRAINT fk_mpord_pago   FOREIGN KEY (pago_id)   REFERENCES orden_pagos (id) ON DELETE SET NULL
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
    console.log('OK: tabla orden_pagos_mp lista.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('No se pudo migrar:', err.message);
  process.exit(1);
});

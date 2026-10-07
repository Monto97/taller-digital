/**
 * Migración para agregar los pagos de la orden a una base ya existente.
 *   - Crea la tabla orden_pagos si no está.
 *   - Amplía el ENUM de orden_eventos.tipo con los dos valores nuevos.
 * Es idempotente: se puede correr varias veces sin romper nada.
 *
 *   node scripts/migrar-pagos.js
 */
const mysql = require('mysql2/promise');
const env = require('../src/config/env');

const CREAR_PAGOS = `
CREATE TABLE IF NOT EXISTS orden_pagos (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  taller_id       INT UNSIGNED  NOT NULL,
  orden_id        INT UNSIGNED  NOT NULL,
  usuario_id      INT UNSIGNED  NULL COMMENT 'Quien registró el cobro',
  monto           DECIMAL(12,2) NOT NULL,
  medio           ENUM('efectivo','transferencia','mercado_pago','tarjeta','otro') NOT NULL,
  fecha           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  nota            VARCHAR(500)  NULL,
  anulada_at      DATETIME      NULL,
  anulada_por     INT UNSIGNED  NULL,
  anulada_motivo  VARCHAR(500)  NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pagos_taller_fecha (taller_id, fecha),
  KEY idx_pagos_orden        (orden_id, anulada_at),
  CONSTRAINT fk_pagos_taller  FOREIGN KEY (taller_id)   REFERENCES talleres (id),
  CONSTRAINT fk_pagos_orden   FOREIGN KEY (orden_id)    REFERENCES ordenes (id) ON DELETE CASCADE,
  CONSTRAINT fk_pagos_usuario FOREIGN KEY (usuario_id)  REFERENCES usuarios (id),
  CONSTRAINT fk_pagos_anulada FOREIGN KEY (anulada_por) REFERENCES usuarios (id),
  CONSTRAINT chk_pagos_monto  CHECK (monto > 0)
) ENGINE=InnoDB
`;

const AMPLIAR_EVENTOS = `
ALTER TABLE orden_eventos
  MODIFY COLUMN tipo ENUM('creada','cambio_estado','presupuesto_enviado','presupuesto_aprobado',
                          'presupuesto_rechazado','aviso_whatsapp','nota',
                          'pago_registrado','pago_anulado') NOT NULL
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
    await conn.query(CREAR_PAGOS);
    console.log('OK: tabla orden_pagos lista.');
    await conn.query(AMPLIAR_EVENTOS);
    console.log('OK: orden_eventos.tipo incluye pago_registrado y pago_anulado.');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('No se pudo migrar:', err.message);
  process.exit(1);
});

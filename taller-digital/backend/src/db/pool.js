const mysql = require('mysql2/promise');
const env = require('../config/env');

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  socketPath: env.DB_SOCKET || undefined,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z', // todo en UTC
  // Los DECIMAL vuelven como string para no perder precisión en montos.
});

/**
 * Ejecuta fn dentro de una transacción. fn recibe la conexión y debe usarla
 * para todas sus queries. Si fn lanza un error, se hace rollback.
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };

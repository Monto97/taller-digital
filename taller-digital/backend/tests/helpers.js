const path = require('node:path');
const fs = require('node:fs');

// Los tests usan .env.test y una base aparte, que se recrea desde cero.
process.env.DOTENV_PATH = path.join(__dirname, '../.env.test');
process.env.NODE_ENV = 'test';

const mysql = require('mysql2/promise');
const env = require('../src/config/env');

if (!env.DB_NAME.endsWith('_test')) {
  throw new Error(`Los tests borran la base: DB_NAME debe terminar en _test (es "${env.DB_NAME}").`);
}

/** Borra y recrea la base de test a partir de database/schema.sql */
async function recrearBase() {
  const schema = fs
    .readFileSync(path.join(__dirname, '../../database/schema.sql'), 'utf8')
    .replace(/CREATE DATABASE IF NOT EXISTS taller_digital/, `CREATE DATABASE ${env.DB_NAME}`)
    .replace(/USE taller_digital;/, `USE ${env.DB_NAME};`);

  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    socketPath: env.DB_SOCKET || undefined,
    multipleStatements: true,
  });
  await conn.query(`DROP DATABASE IF EXISTS ${env.DB_NAME}`);
  await conn.query(schema);
  await conn.end();
}

module.exports = { recrearBase };

/** Registra un taller nuevo y devuelve { token, tallerId, auth } para usar en requests. */
async function crearTaller(app, nombre, email) {
  const request = require('supertest');
  const res = await request(app)
    .post('/api/auth/registro')
    .send({ taller: { nombre }, usuario: { nombre: `Dueño de ${nombre}`, email, password: 'clave-segura-123' } })
    .expect(201);
  return { token: res.body.token, tallerId: res.body.taller.id, auth: `Bearer ${res.body.token}` };
}

module.exports.crearTaller = crearTaller;

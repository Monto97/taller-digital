const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { recrearBase, crearTaller } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');
const { firmarToken } = require('../src/middlewares/auth');

let dueno;
let otro;

before(async () => {
  await recrearBase();
  dueno = await crearTaller(app, 'TuMech', 'dueno@tumech.com');
  otro = await crearTaller(app, 'Otro Taller', 'dueno@otro.com');
});
after(() => pool.end());

describe('GET /api/taller', () => {
  test('devuelve los datos del taller del token', async () => {
    const res = await request(app).get('/api/taller').set('Authorization', dueno.auth).expect(200);
    assert.equal(res.body.id, dueno.tallerId);
    assert.equal(res.body.nombre, 'TuMech');
  });

  test('sin token responde 401', async () => {
    await request(app).get('/api/taller').expect(401);
  });
});

describe('PATCH /api/taller', () => {
  test('el dueño cambia nombre, teléfono y dirección', async () => {
    const res = await request(app)
      .patch('/api/taller')
      .set('Authorization', dueno.auth)
      .send({ nombre: '  El taller del Tano ', telefono: '2241 15 68-9216', direccion: 'Mitre 123' })
      .expect(200);
    assert.equal(res.body.nombre, 'El taller del Tano');
    assert.equal(res.body.telefono, '5492241689216'); // normalizado para wa.me
    assert.equal(res.body.direccion, 'Mitre 123');
    assert.equal(res.body.slug, 'tumech'); // el slug no cambia

    const me = await request(app).get('/api/auth/me').set('Authorization', dueno.auth).expect(200);
    assert.equal(me.body.taller.nombre, 'El taller del Tano');
  });

  test('"" borra el teléfono y la dirección', async () => {
    const res = await request(app)
      .patch('/api/taller')
      .set('Authorization', dueno.auth)
      .send({ telefono: '', direccion: '' })
      .expect(200);
    assert.equal(res.body.telefono, null);
    assert.equal(res.body.direccion, null);
    assert.equal(res.body.nombre, 'El taller del Tano');
  });

  test('no toca otros talleres', async () => {
    const res = await request(app).get('/api/taller').set('Authorization', otro.auth).expect(200);
    assert.equal(res.body.nombre, 'Otro Taller');
  });

  test('valida el nombre y que haya algo para cambiar', async () => {
    const corto = await request(app).patch('/api/taller').set('Authorization', dueno.auth).send({ nombre: 'X' }).expect(400);
    assert.ok(corto.body.error.detalles.nombre);
    await request(app).patch('/api/taller').set('Authorization', dueno.auth).send({}).expect(400);
  });

  test('un mecánico no puede editar el taller', async () => {
    const [r] = await pool.query(
      `INSERT INTO usuarios (taller_id, nombre, email, password_hash, rol) VALUES (?, 'Mecánico', 'meca@tumech.com', 'x', 'mecanico')`,
      [dueno.tallerId],
    );
    const token = firmarToken({ id: r.insertId, taller_id: dueno.tallerId, rol: 'mecanico' });
    await request(app)
      .patch('/api/taller')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Hackeado' })
      .expect(403);
    await request(app).get('/api/taller').set('Authorization', `Bearer ${token}`).expect(200);
  });
});

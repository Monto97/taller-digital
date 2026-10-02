const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { recrearBase } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');

const REGISTRO = {
  taller: { nombre: 'Taller Rodríguez', telefono: '+54 9 221 555-0000' },
  usuario: { nombre: 'Diego Rodríguez', email: 'Diego@Taller.com', password: 'clave-segura-123' },
};

before(recrearBase);
after(() => pool.end());

describe('POST /api/auth/registro', () => {
  test('crea el taller y el usuario dueño', async () => {
    const res = await request(app).post('/api/auth/registro').send(REGISTRO).expect(201);
    assert.ok(res.body.token);
    assert.equal(res.body.usuario.rol, 'dueno');
    assert.equal(res.body.usuario.email, 'diego@taller.com'); // normalizado a minúsculas
    assert.equal(res.body.taller.slug, 'taller-rodriguez');
  });

  test('rechaza un email ya registrado', async () => {
    const res = await request(app).post('/api/auth/registro').send(REGISTRO).expect(409);
    assert.equal(res.body.error.codigo, 'EMAIL_EN_USO');
  });

  test('genera un slug distinto para un taller con el mismo nombre', async () => {
    const otro = { ...REGISTRO, usuario: { ...REGISTRO.usuario, email: 'otro@taller.com' } };
    const res = await request(app).post('/api/auth/registro').send(otro).expect(201);
    assert.equal(res.body.taller.slug, 'taller-rodriguez-2');
  });

  test('valida los campos y devuelve el detalle por campo', async () => {
    const res = await request(app)
      .post('/api/auth/registro')
      .send({ taller: { nombre: '' }, usuario: { nombre: 'X', email: 'no-es-email', password: '123' } })
      .expect(400);
    assert.equal(res.body.error.codigo, 'VALIDACION');
    assert.ok(res.body.error.detalles['taller.nombre']);
    assert.ok(res.body.error.detalles['usuario.email']);
    assert.ok(res.body.error.detalles['usuario.password']);
  });
});

describe('POST /api/auth/login y GET /api/auth/me', () => {
  test('login correcto devuelve un token que sirve para /me', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'diego@taller.com', password: 'clave-segura-123' })
      .expect(200);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    assert.equal(me.body.usuario.nombre, 'Diego Rodríguez');
    assert.equal(me.body.taller.telefono, '5492215550000'); // normalizado para wa.me
  });

  test('contraseña incorrecta y email inexistente dan el mismo error', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'diego@taller.com', password: 'mal' }).expect(401);
    const b = await request(app).post('/api/auth/login').send({ email: 'nadie@taller.com', password: 'mal' }).expect(401);
    assert.equal(a.body.error.codigo, 'CREDENCIALES_INVALIDAS');
    assert.deepEqual(a.body, b.body);
  });

  test('/me sin token o con token inválido da 401', async () => {
    await request(app).get('/api/auth/me').expect(401);
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer basura').expect(401);
    assert.equal(res.body.error.codigo, 'NO_AUTENTICADO');
  });
});

describe('Errores generales', () => {
  test('ruta inexistente da 404 con el formato estándar', async () => {
    const res = await request(app).get('/api/no-existe').expect(404);
    assert.equal(res.body.error.codigo, 'NO_ENCONTRADO');
  });

  test('JSON mal formado da 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ')
      .expect(400);
    assert.equal(res.body.error.codigo, 'JSON_INVALIDO');
  });

  test('/api/salud responde ok', async () => {
    await request(app).get('/api/salud').expect(200, { estado: 'ok' });
  });
});

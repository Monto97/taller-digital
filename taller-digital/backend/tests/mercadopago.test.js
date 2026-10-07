const { test, before, after, describe, mock } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { recrearBase, crearTaller } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');
const env = require('../src/config/env');
const oauth = require('../src/modules/mercadopago/oauth');

let A;
let B;
const api = (taller) => ({
  get: (url) => request(app).get(url).set('Authorization', taller.auth),
  del: (url) => request(app).delete(url).set('Authorization', taller.auth),
});

before(async () => {
  await recrearBase();
  A = await crearTaller(app, 'Taller con MP', 'conmp@taller.com');
  B = await crearTaller(app, 'Otro Taller', 'otro@taller.com');
});
after(() => pool.end());

describe('Mercado Pago — conexión del taller', () => {
  test('al inicio no está conectado', async () => {
    const res = await api(A).get('/api/mp/estado').expect(200);
    assert.equal(res.body.conectado, false);
    assert.equal(res.body.configurado, true);
  });

  test('la URL de autorización lleva client_id, redirect_uri y state firmado', async () => {
    const res = await api(A).get('/api/mp/url').expect(200);
    const u = new URL(res.body.url);
    assert.equal(u.origin + u.pathname, 'https://auth.mercadopago.com.ar/authorization');
    assert.equal(u.searchParams.get('client_id'), env.MP_CLIENT_ID);
    assert.equal(u.searchParams.get('redirect_uri'), env.MP_REDIRECT_URI);
    assert.equal(u.searchParams.get('response_type'), 'code');

    // El state es un JWT verificable con nuestro secreto y lleva el taller del token.
    const state = u.searchParams.get('state');
    const payload = jwt.verify(state, env.JWT_SECRET);
    assert.equal(payload.tid, A.tallerId);
    assert.equal(payload.p, 'mp-oauth');
  });

  test('el callback con state inválido redirige con error', async () => {
    const res = await request(app).get('/api/mp/oauth/callback?code=abc&state=basura').expect(302);
    assert.match(res.headers.location, /\/ajustes\?conectado=error/);
    assert.match(res.headers.location, /motivo=/);
  });

  test('el callback con "error" del usuario (canceló) redirige con el motivo', async () => {
    const res = await request(app).get('/api/mp/oauth/callback?error=access_denied&error_description=user_denied').expect(302);
    assert.match(res.headers.location, /motivo=user_denied/);
  });

  test('el callback con code+state válidos guarda la conexión', async (t) => {
    // Mockeamos la llamada a MP: nos interesa probar nuestro flujo, no la API externa.
    t.mock.method(oauth, 'intercambiarCode', async () => ({
      access_token: 'APP_USR-token-de-prueba',
      refresh_token: 'TG-refresh',
      user_id: 987654321,
      public_key: 'APP_USR-public',
      live_mode: true,
      expires_in: 15552000,
    }));

    const state = jwt.sign({ tid: A.tallerId, uid: 1, p: 'mp-oauth' }, env.JWT_SECRET, { expiresIn: '10m' });
    const res = await request(app).get(`/api/mp/oauth/callback?code=code-de-prueba&state=${state}`).expect(302);
    assert.match(res.headers.location, /\/ajustes\?conectado=ok$/);

    const estado = await api(A).get('/api/mp/estado').expect(200);
    assert.equal(estado.body.conectado, true);
    assert.equal(estado.body.mp_user_id, '987654321');
    assert.equal(estado.body.live_mode, true);
  });

  test('otro taller no ve ni toca la conexión del primero', async () => {
    const estadoB = await api(B).get('/api/mp/estado').expect(200);
    assert.equal(estadoB.body.conectado, false);
  });

  test('desconectar borra la fila', async () => {
    const des = await api(A).del('/api/mp/conexion').expect(200);
    assert.equal(des.body.desconectado, true);

    const estado = await api(A).get('/api/mp/estado').expect(200);
    assert.equal(estado.body.conectado, false);
  });

  test('desconectar sin conexión no rompe', async () => {
    const res = await api(B).del('/api/mp/conexion').expect(200);
    assert.equal(res.body.desconectado, false);
  });

  test('las rutas /url y /conexion exigen login', async () => {
    await request(app).get('/api/mp/url').expect(401);
    await request(app).delete('/api/mp/conexion').expect(401);
    await request(app).get('/api/mp/estado').expect(401);
  });
});

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { recrearBase, crearTaller } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');
const orders = require('../src/modules/mercadopago/orders');

let A;
let B;
let token;
let ordenId;

const api = (taller) => ({
  post: (url, body = {}) => request(app).post(url).set('Authorization', taller.auth).send(body),
  get: (url) => request(app).get(url).set('Authorization', taller.auth),
});

async function conectarMp(tallerId, { accessToken = 'APP_USR-test', mpUserId = '12345' } = {}) {
  await pool.query(
    `INSERT INTO taller_mercadopago (taller_id, mp_user_id, access_token, live_mode)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), mp_user_id = VALUES(mp_user_id)`,
    [tallerId, mpUserId, accessToken],
  );
}

before(async () => {
  await recrearBase();
  A = await crearTaller(app, 'Taller con MP', 'conmp@taller.com');
  B = await crearTaller(app, 'Taller sin MP', 'sinmp@taller.com');

  const nueva = await api(A).post('/api/ordenes', {
    vehiculo: { patente: 'MP111AA', marca: 'Fiat', modelo: 'Palio', cliente: { nombre: 'Cliente MP', telefono: '221 555-0199' } },
    motivo: 'Cambio de aceite',
  });
  ordenId = nueva.body.id;
  token = nueva.body.link_publico.split('/o/')[1];
  await api(A).post(`/api/ordenes/${ordenId}/items`, { tipo: 'mano_de_obra', descripcion: 'Cambio de aceite', precio_unitario: 80000 });
});
after(() => pool.end());

describe('Iniciar pago online', () => {
  test('sin cuenta MP conectada redirige con pago=no_disponible', async () => {
    const res = await request(app).get(`/api/publico/mp/iniciar-pago/${token}`).expect(302);
    assert.match(res.headers.location, new RegExp(`/o/${token}\\?pago=no_disponible$`));
  });

  test('con MP conectado, crea la orden en MP y redirige al checkout_url', async (t) => {
    await conectarMp(A.tallerId);

    const mock = t.mock.method(orders, 'crear', async (args) => {
      assert.equal(args.accessToken, 'APP_USR-test');
      assert.equal(args.monto, 80000);
      assert.equal(args.externalReference, `t${A.tallerId}-o${ordenId}`);
      return { id: 'MP-ORDER-001', checkout_url: 'https://mp.com/checkout/MP-ORDER-001' };
    });

    const res = await request(app).get(`/api/publico/mp/iniciar-pago/${token}`).expect(302);
    assert.equal(res.headers.location, 'https://mp.com/checkout/MP-ORDER-001');
    assert.equal(mock.mock.callCount(), 1);

    const [filas] = await pool.query(
      'SELECT * FROM orden_pagos_mp WHERE orden_id = ? ORDER BY id DESC LIMIT 1',
      [ordenId],
    );
    assert.equal(filas[0].mp_order_id, 'MP-ORDER-001');
    assert.equal(Number(filas[0].monto), 80000);
    assert.equal(filas[0].estado, 'created');
    assert.equal(filas[0].external_reference, `t${A.tallerId}-o${ordenId}`);
  });

  test('un segundo click al toque reusa el checkout_url (no crea otra orden MP)', async (t) => {
    const mock = t.mock.method(orders, 'crear', async () => {
      throw new Error('no debería llamarse');
    });

    const res = await request(app).get(`/api/publico/mp/iniciar-pago/${token}`).expect(302);
    assert.equal(res.headers.location, 'https://mp.com/checkout/MP-ORDER-001');
    assert.equal(mock.mock.callCount(), 0);
  });

  test('si cambia el saldo (pago en efectivo intermedio), crea una nueva orden MP', async (t) => {
    await api(A).post(`/api/ordenes/${ordenId}/pagos`, { monto: 30000, medio: 'efectivo' }).expect(201);

    const mock = t.mock.method(orders, 'crear', async (args) => {
      // Nuevo saldo: 80000 - 30000 = 50000
      assert.equal(args.monto, 50000);
      return { id: 'MP-ORDER-002', checkout_url: 'https://mp.com/checkout/MP-ORDER-002' };
    });

    const res = await request(app).get(`/api/publico/mp/iniciar-pago/${token}`).expect(302);
    assert.equal(res.headers.location, 'https://mp.com/checkout/MP-ORDER-002');
    assert.equal(mock.mock.callCount(), 1);
  });

  test('si no queda saldo redirige con pago=ya_pagada', async () => {
    await api(A).post(`/api/ordenes/${ordenId}/pagos`, { monto: 50000, medio: 'transferencia' }).expect(201);

    const res = await request(app).get(`/api/publico/mp/iniciar-pago/${token}`).expect(302);
    assert.match(res.headers.location, /\?pago=ya_pagada$/);
  });

  test('orden cancelada redirige con pago=cancelada', async () => {
    const otra = await api(A).post('/api/ordenes', {
      vehiculo: { patente: 'MP222BB', marca: 'VW', modelo: 'Gol', cliente: { nombre: 'Cliente MP' } },
      motivo: 'Chequeo',
    }).expect(201);
    const t2 = otra.body.link_publico.split('/o/')[1];
    await api(A).post(`/api/ordenes/${otra.body.id}/estado`, { estado: 'cancelada' }).expect(200);

    const res = await request(app).get(`/api/publico/mp/iniciar-pago/${t2}`).expect(302);
    assert.match(res.headers.location, /\?pago=cancelada$/);
  });

  test('token inválido devuelve 400 (ya lo valida el middleware)', async () => {
    await request(app).get('/api/publico/mp/iniciar-pago/nope').expect(400);
  });

  test('token inexistente redirige con pago=no_encontrado', async () => {
    const inexistente = 'a'.repeat(32);
    const res = await request(app).get(`/api/publico/mp/iniciar-pago/${inexistente}`).expect(302);
    assert.match(res.headers.location, /\?pago=no_encontrado$/);
  });

  test('error de MP redirige con pago=error', async (t) => {
    const otra = await api(A).post('/api/ordenes', {
      vehiculo: { patente: 'MP333CC', marca: 'Peugeot', cliente: { nombre: 'Cliente MP' } },
      motivo: 'Service',
    }).expect(201);
    const t3 = otra.body.link_publico.split('/o/')[1];
    await api(A).post(`/api/ordenes/${otra.body.id}/items`, { tipo: 'mano_de_obra', descripcion: 'OK', precio_unitario: 10000 }).expect(201);

    t.mock.method(orders, 'crear', async () => {
      const err = new Error('rechazado');
      err.mpStatus = 400;
      throw err;
    });

    const res = await request(app).get(`/api/publico/mp/iniciar-pago/${t3}`).expect(302);
    assert.match(res.headers.location, /\?pago=error$/);
  });
});

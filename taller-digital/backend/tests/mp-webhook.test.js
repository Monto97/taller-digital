const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { recrearBase, crearTaller } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');
const orders = require('../src/modules/mercadopago/orders');

let A;
let ordenId;
let token;
let mpOrderId;

const api = (taller) => ({
  post: (url, body = {}) => request(app).post(url).set('Authorization', taller.auth).send(body),
  get: (url) => request(app).get(url).set('Authorization', taller.auth),
});

async function conectarMp(tallerId) {
  await pool.query(
    `INSERT INTO taller_mercadopago (taller_id, mp_user_id, access_token, live_mode)
     VALUES (?, '12345', 'APP_USR-test', 1)
     ON DUPLICATE KEY UPDATE access_token = 'APP_USR-test'`,
    [tallerId],
  );
}

async function crearIntentoMp(t) {
  t.mock.method(orders, 'crear', async () => ({
    id: 'MP-WH-001',
    checkout_url: 'https://mp.com/checkout/MP-WH-001',
  }));
  await request(app).get(`/api/publico/mp/iniciar-pago/${token}`).expect(302);
  const [filas] = await pool.query(
    'SELECT mp_order_id FROM orden_pagos_mp WHERE orden_id = ? ORDER BY id DESC LIMIT 1',
    [ordenId],
  );
  return filas[0].mp_order_id;
}

before(async () => {
  await recrearBase();
  A = await crearTaller(app, 'Taller WH', 'wh@taller.com');
  await conectarMp(A.tallerId);

  const nueva = await api(A).post('/api/ordenes', {
    vehiculo: { patente: 'WH111AA', marca: 'Fiat', cliente: { nombre: 'Cliente WH' } },
    motivo: 'Pastillas',
  }).expect(201);
  ordenId = nueva.body.id;
  token = nueva.body.link_publico.split('/o/')[1];
  await api(A).post(`/api/ordenes/${ordenId}/items`, { tipo: 'mano_de_obra', descripcion: 'Pastillas', precio_unitario: 50000 }).expect(201);
});
after(() => pool.end());

describe('Webhook de Mercado Pago', () => {
  test('sin data.id devuelve 200 y no toca nada', async () => {
    const res = await request(app).post('/api/publico/mp/webhook').send({ type: 'orders' }).expect(200);
    assert.equal(res.body.resultado, 'sin_order_id');
  });

  test('mp_order_id desconocido devuelve 200 (puede ser una orden de otro sistema)', async () => {
    const res = await request(app).post('/api/publico/mp/webhook')
      .send({ type: 'orders', data: { id: 'MP-NO-EXISTE' } }).expect(200);
    assert.equal(res.body.resultado, 'desconocido');
  });

  test('orden en MP sin pagar: no crea orden_pagos', async (t) => {
    mpOrderId = await crearIntentoMp(t);

    t.mock.method(orders, 'obtener', async () => ({ id: mpOrderId, status: 'created' }));

    const res = await request(app).post('/api/publico/mp/webhook')
      .send({ type: 'orders', data: { id: mpOrderId } }).expect(200);
    assert.equal(res.body.resultado, 'no_pagada');

    const [pagos] = await pool.query('SELECT COUNT(*) AS n FROM orden_pagos WHERE orden_id = ?', [ordenId]);
    assert.equal(pagos[0].n, 0);
  });

  test('orden pagada: crea orden_pagos y vincula el pago_id', async (t) => {
    t.mock.method(orders, 'obtener', async () => ({
      id: mpOrderId,
      status: 'processed',
      total_amount: '50000.00',
    }));

    const res = await request(app).post('/api/publico/mp/webhook')
      .send({ type: 'orders', data: { id: mpOrderId } }).expect(200);
    assert.equal(res.body.resultado, 'registrado');

    const detalle = await api(A).get(`/api/ordenes/${ordenId}`).expect(200);
    assert.equal(detalle.body.pagado, '50000.00');
    assert.equal(detalle.body.saldo, '0.00');
    const pago = detalle.body.pagos.find((p) => p.medio === 'mercado_pago');
    assert.ok(pago);
    assert.equal(pago.monto, '50000.00');
    assert.match(pago.nota, /ref MP-WH-/);
    assert.ok(detalle.body.eventos.some((e) => e.tipo === 'pago_registrado'));

    const [vinculo] = await pool.query('SELECT pago_id, estado, pagado_at FROM orden_pagos_mp WHERE mp_order_id = ?', [mpOrderId]);
    assert.equal(vinculo[0].pago_id, pago.id);
    assert.equal(vinculo[0].estado, 'paid');
    assert.ok(vinculo[0].pagado_at);
  });

  test('segunda notificación del mismo pago es idempotente (no duplica)', async (t) => {
    const obtenerMock = t.mock.method(orders, 'obtener', async () => {
      throw new Error('no debería llamarse: ya está registrado');
    });

    const res = await request(app).post('/api/publico/mp/webhook')
      .send({ type: 'orders', data: { id: mpOrderId } }).expect(200);
    assert.equal(res.body.resultado, 'ya_registrado');
    assert.equal(obtenerMock.mock.callCount(), 0);

    const detalle = await api(A).get(`/api/ordenes/${ordenId}`).expect(200);
    assert.equal(detalle.body.pagos.filter((p) => p.medio === 'mercado_pago').length, 1);
  });

  test('firma inválida con MP_WEBHOOK_SECRET configurado devuelve 401', async () => {
    const originalSecret = require('../src/config/env').MP_WEBHOOK_SECRET;
    try {
      require('../src/config/env').MP_WEBHOOK_SECRET = 'secreto-de-pruebas';
      const res = await request(app).post('/api/publico/mp/webhook')
        .set('x-signature', 'ts=123,v1=00deadbeef')
        .set('x-request-id', 'req-abc')
        .send({ type: 'orders', data: { id: 'MP-WH-001' } })
        .expect(401);
      assert.equal(res.body.motivo, 'firma_invalida');
    } finally {
      require('../src/config/env').MP_WEBHOOK_SECRET = originalSecret;
    }
  });

  test('firma válida con secret configurado procesa normalmente', async () => {
    const envMod = require('../src/config/env');
    const originalSecret = envMod.MP_WEBHOOK_SECRET;
    try {
      envMod.MP_WEBHOOK_SECRET = 'secreto-de-pruebas';
      const ts = Date.now().toString();
      const requestId = 'req-xyz';
      const manifiesto = `id:MP-WH-001;request-id:${requestId};ts:${ts};`;
      const hash = crypto.createHmac('sha256', 'secreto-de-pruebas').update(manifiesto).digest('hex');

      const res = await request(app).post('/api/publico/mp/webhook')
        .set('x-signature', `ts=${ts},v1=${hash}`)
        .set('x-request-id', requestId)
        .send({ type: 'orders', data: { id: 'MP-WH-001' } })
        .expect(200);
      // Ya está registrada → ya_registrado
      assert.equal(res.body.resultado, 'ya_registrado');
    } finally {
      envMod.MP_WEBHOOK_SECRET = originalSecret;
    }
  });
});

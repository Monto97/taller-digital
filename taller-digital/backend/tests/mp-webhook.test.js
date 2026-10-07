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
let preferenceId;
let externalReference;
const PAGO_ID_MP = 'PAY-WH-001';

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
  t.mock.method(orders, 'crearPreferencia', async () => ({
    id: 'MP-PREF-WH-001',
    init_point: 'https://mp.com/checkout/MP-PREF-WH-001',
  }));
  await request(app).get(`/api/publico/mp/iniciar-pago/${token}`).expect(302);
  const [filas] = await pool.query(
    'SELECT mp_order_id, external_reference FROM orden_pagos_mp WHERE orden_id = ? ORDER BY id DESC LIMIT 1',
    [ordenId],
  );
  return { preferenceId: filas[0].mp_order_id, externalReference: filas[0].external_reference };
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
    const res = await request(app).post('/api/publico/mp/webhook').send({ type: 'payment' }).expect(200);
    assert.equal(res.body.resultado, 'sin_pago_id');
  });

  test('sin taller en la URL no procesa (notification_url mal armada)', async () => {
    const res = await request(app).post('/api/publico/mp/webhook')
      .send({ type: 'payment', data: { id: 'PAY-NO-EXISTE' } }).expect(200);
    assert.equal(res.body.resultado, 'sin_taller_en_notification_url');
  });

  test('pago no vinculado a ninguna preferencia conocida devuelve desconocido', async (t) => {
    t.mock.method(orders, 'obtenerPago', async () => ({
      id: 'PAY-NO-EXISTE', status: 'approved', preference_id: 'MP-PREF-OTRO',
    }));
    const res = await request(app).post(`/api/publico/mp/webhook?taller=${A.tallerId}`)
      .send({ type: 'payment', data: { id: 'PAY-NO-EXISTE' } }).expect(200);
    assert.equal(res.body.resultado, 'desconocido');
  });

  test('pago pendiente: no crea orden_pagos', async (t) => {
    const intento = await crearIntentoMp(t);
    preferenceId = intento.preferenceId;
    externalReference = intento.externalReference;

    t.mock.method(orders, 'obtenerPago', async () => ({
      id: PAGO_ID_MP, status: 'pending', preference_id: preferenceId, external_reference: externalReference,
    }));

    const res = await request(app).post(`/api/publico/mp/webhook?taller=${A.tallerId}`)
      .send({ type: 'payment', data: { id: PAGO_ID_MP } }).expect(200);
    assert.equal(res.body.resultado, 'no_pagada');

    const [pagos] = await pool.query('SELECT COUNT(*) AS n FROM orden_pagos WHERE orden_id = ?', [ordenId]);
    assert.equal(pagos[0].n, 0);
  });

  test('pago aprobado: crea orden_pagos y vincula el pago_id', async (t) => {
    t.mock.method(orders, 'obtenerPago', async () => ({
      id: PAGO_ID_MP,
      status: 'approved',
      transaction_amount: 50000,
      preference_id: preferenceId,
      external_reference: externalReference,
    }));

    const res = await request(app).post(`/api/publico/mp/webhook?taller=${A.tallerId}`)
      .send({ type: 'payment', data: { id: PAGO_ID_MP } }).expect(200);
    assert.equal(res.body.resultado, 'registrado');

    const detalle = await api(A).get(`/api/ordenes/${ordenId}`).expect(200);
    assert.equal(detalle.body.pagado, '50000.00');
    assert.equal(detalle.body.saldo, '0.00');
    const pago = detalle.body.pagos.find((p) => p.medio === 'mercado_pago');
    assert.ok(pago);
    assert.equal(pago.monto, '50000.00');
    assert.match(pago.nota, /ref PAY-WH-/);
    assert.ok(detalle.body.eventos.some((e) => e.tipo === 'pago_registrado'));

    const [vinculo] = await pool.query('SELECT pago_id, estado, pagado_at FROM orden_pagos_mp WHERE mp_order_id = ?', [preferenceId]);
    assert.equal(vinculo[0].pago_id, pago.id);
    assert.equal(vinculo[0].estado, 'paid');
    assert.ok(vinculo[0].pagado_at);
  });

  test('segunda notificación del mismo pago es idempotente (no duplica)', async (t) => {
    const obtenerMock = t.mock.method(orders, 'obtenerPago', async () => ({
      id: PAGO_ID_MP, status: 'approved', preference_id: preferenceId, external_reference: externalReference,
    }));

    const res = await request(app).post(`/api/publico/mp/webhook?taller=${A.tallerId}`)
      .send({ type: 'payment', data: { id: PAGO_ID_MP } }).expect(200);
    assert.equal(res.body.resultado, 'ya_registrado');
    // Se llamó una vez (para obtener los datos del pago) y después matcheó el registro ya marcado.
    assert.ok(obtenerMock.mock.callCount() <= 1);

    const detalle = await api(A).get(`/api/ordenes/${ordenId}`).expect(200);
    assert.equal(detalle.body.pagos.filter((p) => p.medio === 'mercado_pago').length, 1);
  });

  test('firma inválida con MP_WEBHOOK_SECRET configurado devuelve 401', async () => {
    const originalSecret = require('../src/config/env').MP_WEBHOOK_SECRET;
    try {
      require('../src/config/env').MP_WEBHOOK_SECRET = 'secreto-de-pruebas';
      const res = await request(app).post(`/api/publico/mp/webhook?taller=${A.tallerId}`)
        .set('x-signature', 'ts=123,v1=00deadbeef')
        .set('x-request-id', 'req-abc')
        .send({ type: 'payment', data: { id: PAGO_ID_MP } })
        .expect(401);
      assert.equal(res.body.motivo, 'firma_invalida');
    } finally {
      require('../src/config/env').MP_WEBHOOK_SECRET = originalSecret;
    }
  });

  test('firma válida con secret configurado procesa normalmente', async (t) => {
    const envMod = require('../src/config/env');
    const originalSecret = envMod.MP_WEBHOOK_SECRET;
    try {
      envMod.MP_WEBHOOK_SECRET = 'secreto-de-pruebas';
      t.mock.method(orders, 'obtenerPago', async () => ({
        id: PAGO_ID_MP, status: 'approved', preference_id: preferenceId, external_reference: externalReference,
      }));
      const ts = Date.now().toString();
      const requestId = 'req-xyz';
      const manifiesto = `id:${PAGO_ID_MP};request-id:${requestId};ts:${ts};`;
      const hash = crypto.createHmac('sha256', 'secreto-de-pruebas').update(manifiesto).digest('hex');

      const res = await request(app).post(`/api/publico/mp/webhook?taller=${A.tallerId}`)
        .set('x-signature', `ts=${ts},v1=${hash}`)
        .set('x-request-id', requestId)
        .send({ type: 'payment', data: { id: PAGO_ID_MP } })
        .expect(200);
      // Ya está registrada → ya_registrado
      assert.equal(res.body.resultado, 'ya_registrado');
    } finally {
      envMod.MP_WEBHOOK_SECRET = originalSecret;
    }
  });
});

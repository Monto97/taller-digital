const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { recrearBase, crearTaller } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');

let A;
const api = (url, body) => request(app).post(url).set('Authorization', A.auth).send(body ?? {});
const tokenDe = (orden) => orden.link_publico.split('/o/')[1];

/** Crea una orden con presupuesto enviado y devuelve { id, token }. */
async function ordenConPresupuesto(patente) {
  const orden = await api('/api/ordenes', {
    vehiculo: { patente, marca: 'Fiat', modelo: 'Cronos', cliente: { nombre: 'Laura Giménez', telefono: '221 555-0143' } },
    motivo: 'Ruido en la distribución',
  });
  await api(`/api/ordenes/${orden.body.id}/estado`, { estado: 'diagnostico' });
  await api(`/api/ordenes/${orden.body.id}/notas`, { detalle: 'NOTA INTERNA: cliente complicado' });
  await api(`/api/ordenes/${orden.body.id}/items`, { tipo: 'repuesto', descripcion: 'Kit de distribución', precio_unitario: 214000 });
  return { id: orden.body.id, token: tokenDe(orden.body) };
}

before(async () => {
  await recrearBase();
  A = await crearTaller(app, 'Taller Rodríguez', 'a@taller.com');
});
after(() => pool.end());

describe('Link público del cliente', () => {
  test('antes de enviar el presupuesto, el cliente ve el estado pero no los precios', async () => {
    const { token } = await ordenConPresupuesto('AE482KT');
    const res = await request(app).get(`/api/publico/ordenes/${token}`).expect(200);
    assert.equal(res.body.taller.nombre, 'Taller Rodríguez');
    assert.equal(res.body.cliente.nombre, 'Laura');
    assert.equal(res.body.orden.estado, 'diagnostico');
    assert.equal(res.body.presupuesto, null);
    assert.deepEqual(res.body.linea_de_tiempo.map((e) => e.estado), ['recibido', 'diagnostico']);
  });

  test('no expone notas internas ni datos de contacto del cliente', async () => {
    const { token } = await ordenConPresupuesto('AB123CD');
    const res = await request(app).get(`/api/publico/ordenes/${token}`).expect(200);
    const texto = JSON.stringify(res.body);
    assert.ok(!texto.includes('NOTA INTERNA'));
    assert.ok(!texto.includes('5492215550143'));
    assert.ok(!('id' in res.body.orden));
  });

  test('el cliente aprueba el presupuesto y la orden pasa a reparación', async () => {
    const { id, token } = await ordenConPresupuesto('AC556TD');
    await api(`/api/ordenes/${id}/presupuesto/enviar`);

    const visto = await request(app).get(`/api/publico/ordenes/${token}`).expect(200);
    assert.equal(visto.body.presupuesto.estado, 'enviado');
    assert.equal(visto.body.presupuesto.items.length, 1);
    assert.equal(visto.body.presupuesto.total, '214000.00');

    const res = await request(app).post(`/api/publico/ordenes/${token}/aprobar`).expect(200);
    assert.equal(res.body.orden.estado, 'en_reparacion');
    assert.equal(res.body.presupuesto.estado, 'aprobado');

    // El taller lo ve como aprobado por el cliente.
    const interna = await request(app).get(`/api/ordenes/${id}`).set('Authorization', A.auth).expect(200);
    const aprobacion = interna.body.eventos.find((e) => e.tipo === 'presupuesto_aprobado');
    assert.equal(aprobacion.detalle, 'Aprobado por el cliente');
    assert.equal(aprobacion.usuario_nombre, 'Cliente');
  });

  test('no se puede aprobar dos veces', async () => {
    const { id, token } = await ordenConPresupuesto('AD734PL');
    await api(`/api/ordenes/${id}/presupuesto/enviar`);
    await request(app).post(`/api/publico/ordenes/${token}/aprobar`).expect(200);
    const res = await request(app).post(`/api/publico/ordenes/${token}/aprobar`).expect(409);
    assert.equal(res.body.error.codigo, 'PRESUPUESTO_BLOQUEADO');
  });

  test('no se puede aprobar un presupuesto que todavía no se envió', async () => {
    const { token } = await ordenConPresupuesto('AF219KD');
    await request(app).post(`/api/publico/ordenes/${token}/aprobar`).expect(409);
  });

  test('el cliente rechaza con un motivo y el taller puede reenviar', async () => {
    const { id, token } = await ordenConPresupuesto('AA318GH');
    await api(`/api/ordenes/${id}/presupuesto/enviar`);

    const res = await request(app)
      .post(`/api/publico/ordenes/${token}/rechazar`)
      .send({ motivo: 'Lo consulto con mi marido' })
      .expect(200);
    assert.equal(res.body.orden.estado, 'diagnostico');
    assert.equal(res.body.presupuesto.estado, 'rechazado');

    const interna = await request(app).get(`/api/ordenes/${id}`).set('Authorization', A.auth).expect(200);
    assert.equal(interna.body.eventos.find((e) => e.tipo === 'presupuesto_rechazado').detalle, 'Lo consulto con mi marido');

    const reenvio = await api(`/api/ordenes/${id}/presupuesto/enviar`).expect(200);
    assert.equal(reenvio.body.presupuesto.estado, 'enviado');
  });

  test('un token inexistente o mal formado da 404 o 400, sin revelar nada', async () => {
    await request(app).get(`/api/publico/ordenes/${'0'.repeat(32)}`).expect(404);
    await request(app).get('/api/publico/ordenes/123').expect(400);
  });
});

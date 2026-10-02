const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { recrearBase, crearTaller } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');

let A;
let B;
const api = (taller) => ({
  get: (url) => request(app).get(url).set('Authorization', taller.auth),
  post: (url, body = {}) => request(app).post(url).set('Authorization', taller.auth).send(body),
  patch: (url, body) => request(app).patch(url).set('Authorization', taller.auth).send(body),
  del: (url) => request(app).delete(url).set('Authorization', taller.auth),
});

before(async () => {
  await recrearBase();
  A = await crearTaller(app, 'Taller Rodríguez', 'a@taller.com');
  B = await crearTaller(app, 'Taller Pérez', 'b@taller.com');
});
after(() => pool.end());

describe('Flujo completo de una orden', () => {
  let ordenId;
  let vehiculoId;
  let itemManoObra;

  test('crea la orden con vehículo y cliente nuevos en un solo paso', async () => {
    const res = await api(A)
      .post('/api/ordenes', {
        vehiculo: {
          patente: 'ae 482 kt', marca: 'Fiat', modelo: 'Cronos',
          cliente: { nombre: 'Laura Giménez', telefono: '221 555-0143' },
        },
        motivo: 'Ruido en la distribución',
        km_ingreso: 87450,
      })
      .expect(201);

    ordenId = res.body.id;
    vehiculoId = res.body.vehiculo.id;
    assert.equal(res.body.numero, 1);
    assert.equal(res.body.estado, 'recibido');
    assert.deepEqual(res.body.estados_siguientes, ['diagnostico', 'en_reparacion', 'cancelada']);
    assert.equal(res.body.vehiculo.km_actual, 87450);
    assert.match(res.body.link_publico, /\/o\/[0-9a-f]{32}$/);
    assert.match(res.body.whatsapp_url, /^https:\/\/wa\.me\/5492215550143\?text=/);
    assert.match(decodeURIComponent(res.body.whatsapp_url), /Hola Laura! Recibimos tu Fiat Cronos AE 482 KT/);
    assert.equal(res.body.eventos[0].tipo, 'creada');
  });

  test('la segunda orden del taller toma el número 2, y la del otro taller el 1', async () => {
    const segunda = await api(A).post('/api/ordenes', { vehiculo_id: vehiculoId, motivo: 'Revisar frenos' }).expect(201);
    assert.equal(segunda.body.numero, 2);
    await api(A).post(`/api/ordenes/${segunda.body.id}/estado`, { estado: 'cancelada' }).expect(200);

    const deB = await api(B)
      .post('/api/ordenes', { vehiculo: { patente: 'AB123CD', cliente: { nombre: 'Cliente B' } }, motivo: 'Service' })
      .expect(201);
    assert.equal(deB.body.numero, 1);
  });

  test('no deja saltar estados', async () => {
    const res = await api(A).post(`/api/ordenes/${ordenId}/estado`, { estado: 'listo' }).expect(409);
    assert.equal(res.body.error.codigo, 'TRANSICION_INVALIDA');
  });

  test('pasa a diagnóstico y carga el diagnóstico', async () => {
    await api(A).post(`/api/ordenes/${ordenId}/estado`, { estado: 'diagnostico' }).expect(200);
    const res = await api(A).patch(`/api/ordenes/${ordenId}`, { diagnostico: 'Tensor gastado, bomba con pérdida' }).expect(200);
    assert.equal(res.body.diagnostico, 'Tensor gastado, bomba con pérdida');
  });

  test('no se puede enviar un presupuesto vacío', async () => {
    const res = await api(A).post(`/api/ordenes/${ordenId}/presupuesto/enviar`).expect(409);
    assert.equal(res.body.error.codigo, 'PRESUPUESTO_VACIO');
  });

  test('agrega ítems y recalcula el total', async () => {
    await api(A).post(`/api/ordenes/${ordenId}/items`, { tipo: 'repuesto', descripcion: 'Kit de distribución', precio_unitario: 214000 }).expect(201);
    await api(A).post(`/api/ordenes/${ordenId}/items`, { tipo: 'repuesto', descripcion: 'Refrigerante', cantidad: 2, precio_unitario: 12000 }).expect(201);
    const res = await api(A).post(`/api/ordenes/${ordenId}/items`, { tipo: 'mano_de_obra', descripcion: 'Mano de obra', precio_unitario: 150000 }).expect(201);
    itemManoObra = res.body.items[2].id;
    assert.equal(res.body.items.length, 3);
    assert.equal(res.body.items[1].subtotal, '24000.00');
    assert.equal(res.body.total, '388000.00');
  });

  test('envía el presupuesto: pasa a esperando aprobación y arma el WhatsApp', async () => {
    const res = await api(A).post(`/api/ordenes/${ordenId}/presupuesto/enviar`).expect(200);
    assert.equal(res.body.estado, 'esperando_aprobacion');
    assert.equal(res.body.presupuesto.estado, 'enviado');
    assert.match(decodeURIComponent(res.body.whatsapp_url), /El presupuesto es de \$ 388\.000/);
  });

  test('modificar un presupuesto enviado lo vuelve a borrador y la orden a diagnóstico', async () => {
    const res = await api(A).patch(`/api/ordenes/${ordenId}/items/${itemManoObra}`, { precio_unitario: 160000 }).expect(200);
    assert.equal(res.body.total, '398000.00');
    assert.equal(res.body.presupuesto.estado, 'borrador');
    assert.equal(res.body.estado, 'diagnostico');
  });

  test('reenvía y el taller registra la aprobación telefónica', async () => {
    await api(A).post(`/api/ordenes/${ordenId}/presupuesto/enviar`).expect(200);
    const res = await api(A).post(`/api/ordenes/${ordenId}/estado`, { estado: 'en_reparacion' }).expect(200);
    assert.equal(res.body.estado, 'en_reparacion');
    assert.equal(res.body.presupuesto.estado, 'aprobado');
    assert.ok(res.body.eventos.some((e) => e.tipo === 'presupuesto_aprobado'));
  });

  test('con el presupuesto aprobado se pueden sumar ítems sin invalidarlo', async () => {
    const res = await api(A).post(`/api/ordenes/${ordenId}/items`, { tipo: 'otro', descripcion: 'Correa auxiliar', precio_unitario: 25000 }).expect(201);
    assert.equal(res.body.presupuesto.estado, 'aprobado');
    assert.equal(res.body.total, '423000.00');
  });

  test('al pasar a listo devuelve el WhatsApp de aviso', async () => {
    const res = await api(A).post(`/api/ordenes/${ordenId}/estado`, { estado: 'listo' }).expect(200);
    assert.match(decodeURIComponent(res.body.whatsapp_url), /ya está listo para retirar en Taller Rodríguez/);
  });

  test('aparece en el tablero en la columna correcta', async () => {
    const res = await api(A).get('/api/tablero').expect(200);
    assert.equal(res.body.resumen.en_taller, 1);
    assert.equal(res.body.resumen.listos, 1);
    assert.equal(res.body.columnas.listo[0].patente, 'AE482KT');
    assert.equal(res.body.columnas.listo[0].vehiculo, 'Fiat Cronos');
  });

  test('se entrega y queda cerrada', async () => {
    const res = await api(A).post(`/api/ordenes/${ordenId}/estado`, { estado: 'entregado' }).expect(200);
    assert.ok(res.body.fecha_entrega);
    assert.deepEqual(res.body.estados_siguientes, []);

    const cerrada = await api(A).post(`/api/ordenes/${ordenId}/items`, { tipo: 'otro', descripcion: 'X', precio_unitario: 1 }).expect(409);
    assert.equal(cerrada.body.error.codigo, 'ORDEN_CERRADA');

    const tablero = await api(A).get('/api/tablero').expect(200);
    assert.equal(tablero.body.resumen.en_taller, 0);
    assert.equal(tablero.body.resumen.entregados_hoy, 1);
  });

  test('queda en el historial del vehículo con todos sus ítems (sin la cancelada)', async () => {
    const res = await api(A).get(`/api/vehiculos/${vehiculoId}/historial`).expect(200);
    assert.equal(res.body.ordenes.length, 1);
    assert.equal(res.body.ordenes[0].items.length, 4);
  });

  test('la bitácora registra todo el recorrido', async () => {
    const res = await api(A).get(`/api/ordenes/${ordenId}`).expect(200);
    const estados = res.body.eventos.filter((e) => e.tipo === 'cambio_estado').map((e) => e.estado_hasta);
    assert.deepEqual(estados, ['diagnostico', 'esperando_aprobacion', 'diagnostico', 'esperando_aprobacion', 'en_reparacion', 'listo', 'entregado']);
  });
});

describe('Listado, notas, WhatsApp y aislamiento entre talleres', () => {
  let ordenId;

  before(async () => {
    const res = await api(A).post('/api/ordenes', {
      vehiculo: { patente: 'A057JKR', tipo: 'moto', marca: 'Honda', cliente: { nombre: 'Pablo Sin Teléfono' } },
      motivo: 'Service 10.000 km',
    });
    ordenId = res.body.id;
    assert.equal(res.body.whatsapp_url, null); // sin teléfono no hay link
  });

  test('filtra activas, por estado y por texto', async () => {
    const activas = await api(A).get('/api/ordenes?activas=true').expect(200);
    assert.equal(activas.body.total, 1);
    const varias = await api(A).get('/api/ordenes?estado=entregado,cancelada').expect(200);
    assert.equal(varias.body.total, 2);
    const porPatente = await api(A).get('/api/ordenes?q=a057').expect(200);
    assert.equal(porPatente.body.datos[0].id, ordenId);
    await api(A).get('/api/ordenes?estado=inventado').expect(400);
  });

  test('agrega una nota interna', async () => {
    const res = await api(A).post(`/api/ordenes/${ordenId}/notas`, { detalle: 'El cliente pasa a buscarla el viernes' }).expect(201);
    assert.equal(res.body.eventos.at(-1).tipo, 'nota');
  });

  test('pedir el WhatsApp de un cliente sin teléfono da un error claro', async () => {
    const res = await api(A).get(`/api/ordenes/${ordenId}/whatsapp?plantilla=recibido`).expect(409);
    assert.equal(res.body.error.codigo, 'CLIENTE_SIN_TELEFONO');
  });

  test('no se puede asignar un mecánico de otro taller', async () => {
    const [[duenoB]] = await pool.query('SELECT id FROM usuarios WHERE email = ?', ['b@taller.com']);
    await api(A).patch(`/api/ordenes/${ordenId}`, { mecanico_id: duenoB.id }).expect(404);
  });

  test('otro taller no puede ver, editar ni mover la orden', async () => {
    await api(B).get(`/api/ordenes/${ordenId}`).expect(404);
    await api(B).patch(`/api/ordenes/${ordenId}`, { motivo: 'Hackeada' }).expect(404);
    await api(B).post(`/api/ordenes/${ordenId}/estado`, { estado: 'cancelada' }).expect(404);
    await api(B).post(`/api/ordenes/${ordenId}/items`, { tipo: 'otro', descripcion: 'X', precio_unitario: 1 }).expect(404);
    const lista = await api(B).get('/api/ordenes').expect(200);
    assert.equal(lista.body.total, 1); // solo la suya
  });

  test('no se puede editar un ítem de otra orden', async () => {
    const otra = await api(A).post('/api/ordenes', { vehiculo_id: (await api(A).get('/api/vehiculos/patente/A057JKR')).body.id, motivo: 'Otra cosa' });
    const conItem = await api(A).post(`/api/ordenes/${otra.body.id}/items`, { tipo: 'otro', descripcion: 'Y', precio_unitario: 1 });
    const itemAjeno = conItem.body.items[0].id;
    await api(A).patch(`/api/ordenes/${ordenId}/items/${itemAjeno}`, { precio_unitario: 999 }).expect(404);
  });
});

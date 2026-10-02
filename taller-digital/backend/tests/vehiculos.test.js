const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { recrearBase, crearTaller } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');

let tallerA;
let tallerB;

before(async () => {
  await recrearBase();
  tallerA = await crearTaller(app, 'Taller Rodríguez', 'a@taller.com');
  tallerB = await crearTaller(app, 'Taller Pérez', 'b@taller.com');
});
after(() => pool.end());

describe('Clientes', () => {
  let clienteId;

  test('crea un cliente y normaliza el teléfono', async () => {
    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', tallerA.auth)
      .send({ nombre: 'Laura Giménez', telefono: '221 555-0143', email: 'Laura@Mail.com' })
      .expect(201);
    clienteId = res.body.id;
    assert.equal(res.body.telefono, '5492215550143');
    assert.equal(res.body.email, 'laura@mail.com');
    assert.deepEqual(res.body.vehiculos, []);
  });

  test('busca por nombre y por teléfono', async () => {
    const porNombre = await request(app).get('/api/clientes?q=gimé').set('Authorization', tallerA.auth).expect(200);
    assert.equal(porNombre.body.total, 1);
    const porTel = await request(app).get('/api/clientes?q=555-0143').set('Authorization', tallerA.auth).expect(200);
    assert.equal(porTel.body.datos[0].id, clienteId);
  });

  test('edita y permite borrar un campo con string vacío', async () => {
    const res = await request(app)
      .patch(`/api/clientes/${clienteId}`)
      .set('Authorization', tallerA.auth)
      .send({ email: '', notas: 'Prefiere que le escriban' })
      .expect(200);
    assert.equal(res.body.email, null);
    assert.equal(res.body.notas, 'Prefiere que le escriban');
  });

  test('otro taller no lo ve ni lo puede editar', async () => {
    await request(app).get(`/api/clientes/${clienteId}`).set('Authorization', tallerB.auth).expect(404);
    await request(app).patch(`/api/clientes/${clienteId}`).set('Authorization', tallerB.auth).send({ nombre: 'Hackeado' }).expect(404);
    const lista = await request(app).get('/api/clientes').set('Authorization', tallerB.auth).expect(200);
    assert.equal(lista.body.total, 0);
  });

  test('sin token da 401', async () => {
    await request(app).get('/api/clientes').expect(401);
  });
});

describe('Vehículos', () => {
  let vehiculoId;
  let clienteId;

  test('crea un vehículo con un cliente nuevo en el mismo request', async () => {
    const res = await request(app)
      .post('/api/vehiculos')
      .set('Authorization', tallerA.auth)
      .send({
        patente: 'ae-482 kt', marca: 'Fiat', modelo: 'Cronos', anio: 2019, km_actual: 87450,
        cliente: { nombre: 'Marcos Díaz', telefono: '0221 15 444-1234' },
      })
      .expect(201);
    vehiculoId = res.body.id;
    clienteId = res.body.cliente.id;
    assert.equal(res.body.patente, 'AE482KT');
    assert.equal(res.body.tipo, 'auto');
    assert.equal(res.body.cliente.telefono, '5492214441234');
    assert.equal(res.body.visitas, 0);
    assert.equal(res.body.orden_activa, null);
  });

  test('crea una moto para un cliente existente', async () => {
    const res = await request(app)
      .post('/api/vehiculos')
      .set('Authorization', tallerA.auth)
      .send({ patente: 'A057JKR', tipo: 'moto', marca: 'Honda', cliente_id: clienteId })
      .expect(201);
    assert.equal(res.body.tipo, 'moto');
    assert.equal(res.body.cliente.id, clienteId);
  });

  test('patente duplicada devuelve el ID del vehículo existente', async () => {
    const res = await request(app)
      .post('/api/vehiculos')
      .set('Authorization', tallerA.auth)
      .send({ patente: 'AE 482 KT', cliente_id: clienteId })
      .expect(409);
    assert.equal(res.body.error.codigo, 'PATENTE_DUPLICADA');
    assert.equal(res.body.error.detalles.vehiculo_id, vehiculoId);
  });

  test('la misma patente puede existir en otro taller', async () => {
    await request(app)
      .post('/api/vehiculos')
      .set('Authorization', tallerB.auth)
      .send({ patente: 'AE482KT', cliente: { nombre: 'Otro dueño' } })
      .expect(201);
  });

  test('valida el formato de patente, salvo con formato_libre', async () => {
    const mal = await request(app)
      .post('/api/vehiculos')
      .set('Authorization', tallerA.auth)
      .send({ patente: 'XYZ99', cliente_id: clienteId })
      .expect(400);
    assert.ok(mal.body.error.detalles.patente);

    await request(app)
      .post('/api/vehiculos')
      .set('Authorization', tallerA.auth)
      .send({ patente: 'XYZ99', formato_libre: true, cliente_id: clienteId })
      .expect(201);
  });

  test('pide cliente_id o cliente, no ninguno ni ambos', async () => {
    await request(app).post('/api/vehiculos').set('Authorization', tallerA.auth).send({ patente: 'AA111AA' }).expect(400);
    await request(app)
      .post('/api/vehiculos')
      .set('Authorization', tallerA.auth)
      .send({ patente: 'AA111AA', cliente_id: clienteId, cliente: { nombre: 'X Y' } })
      .expect(400);
  });

  test('no permite asignar un cliente de otro taller', async () => {
    const clienteDeB = await request(app)
      .post('/api/clientes').set('Authorization', tallerB.auth).send({ nombre: 'Cliente de B' }).expect(201);
    await request(app)
      .post('/api/vehiculos')
      .set('Authorization', tallerA.auth)
      .send({ patente: 'AB123CD', cliente_id: clienteDeB.body.id })
      .expect(404);
  });

  test('busca por patente exacta en cualquier formato', async () => {
    const res = await request(app).get('/api/vehiculos/patente/ae-482-kt').set('Authorization', tallerA.auth).expect(200);
    assert.equal(res.body.id, vehiculoId);
    await request(app).get('/api/vehiculos/patente/ZZ999ZZ').set('Authorization', tallerA.auth).expect(404);
  });

  test('lista y filtra por texto y tipo', async () => {
    const porPatente = await request(app).get('/api/vehiculos?q=482').set('Authorization', tallerA.auth).expect(200);
    assert.equal(porPatente.body.total, 1);
    const motos = await request(app).get('/api/vehiculos?tipo=moto').set('Authorization', tallerA.auth).expect(200);
    assert.equal(motos.body.total, 1);
    const porDueno = await request(app).get('/api/vehiculos?q=marcos').set('Authorization', tallerA.auth).expect(200);
    assert.equal(porDueno.body.total, 3);
  });

  test('edita kilometraje y cambia de dueño', async () => {
    const nuevo = await request(app)
      .post('/api/clientes').set('Authorization', tallerA.auth).send({ nombre: 'Nuevo Dueño' }).expect(201);
    const res = await request(app)
      .patch(`/api/vehiculos/${vehiculoId}`)
      .set('Authorization', tallerA.auth)
      .send({ km_actual: 90000, cliente_id: nuevo.body.id })
      .expect(200);
    assert.equal(res.body.km_actual, 90000);
    assert.equal(res.body.cliente.nombre, 'Nuevo Dueño');
  });

  test('historial devuelve las órdenes con sus ítems', async () => {
    const [orden] = await pool.query(
      `INSERT INTO ordenes (taller_id, numero, vehiculo_id, cliente_id, motivo, estado, total, token_publico)
       VALUES (?, 1, ?, ?, 'Service 80.000', 'entregado', 168900, REPLACE(UUID(), '-', ''))`,
      [tallerA.tallerId, vehiculoId, clienteId],
    );
    await pool.query(
      `INSERT INTO orden_items (orden_id, tipo, descripcion, cantidad, precio_unitario) VALUES
       (?, 'repuesto', 'Aceite 5W30', 4, 18000), (?, 'mano_de_obra', 'Service', 1, 96900)`,
      [orden.insertId, orden.insertId],
    );

    const res = await request(app).get(`/api/vehiculos/${vehiculoId}/historial`).set('Authorization', tallerA.auth).expect(200);
    assert.equal(res.body.ordenes.length, 1);
    assert.equal(res.body.ordenes[0].items.length, 2);
    assert.equal(res.body.ordenes[0].total, '168900.00');

    const detalle = await request(app).get(`/api/vehiculos/${vehiculoId}`).set('Authorization', tallerA.auth).expect(200);
    assert.equal(detalle.body.visitas, 1);
  });

  test('otro taller no puede ver el historial', async () => {
    await request(app).get(`/api/vehiculos/${vehiculoId}/historial`).set('Authorization', tallerB.auth).expect(404);
  });

  test('no se puede eliminar un cliente con vehículos', async () => {
    const res = await request(app).delete(`/api/clientes/${clienteId}`).set('Authorization', tallerA.auth).expect(409);
    assert.equal(res.body.error.codigo, 'CLIENTE_CON_VEHICULOS');
  });
});

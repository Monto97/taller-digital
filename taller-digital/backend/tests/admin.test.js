const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { recrearBase, crearTaller } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');

// En .env.test, ADMIN_EMAILS=admin@taller.com
let admin;
let comun;

before(async () => {
  await recrearBase();
  admin = await crearTaller(app, 'Mi Taller de Pruebas', 'admin@taller.com');
  comun = await crearTaller(app, 'Taller Rodríguez', 'diego@taller.com');

  // Actividad en el taller común: dos órdenes, una con presupuesto aprobado por el cliente y entregada.
  const post = (url, body) => request(app).post(url).set('Authorization', comun.auth).send(body ?? {});
  const o1 = await post('/api/ordenes', {
    vehiculo: { patente: 'AE482KT', cliente: { nombre: 'Laura', telefono: '221 555-0143' } }, motivo: 'Distribución',
  });
  await post(`/api/ordenes/${o1.body.id}/estado`, { estado: 'diagnostico' });
  await post(`/api/ordenes/${o1.body.id}/items`, { tipo: 'repuesto', descripcion: 'Kit', precio_unitario: 200000 });
  await post(`/api/ordenes/${o1.body.id}/presupuesto/enviar`);
  await request(app).post(`/api/publico/ordenes/${o1.body.link_publico.split('/o/')[1]}/aprobar`);
  await post(`/api/ordenes/${o1.body.id}/estado`, { estado: 'listo' });
  await post(`/api/ordenes/${o1.body.id}/whatsapp/registrar`, { plantilla: 'listo' });
  await post(`/api/ordenes/${o1.body.id}/estado`, { estado: 'entregado' });
  await post('/api/ordenes', { vehiculo: { patente: 'AB123CD', cliente: { nombre: 'Juan' } }, motivo: 'Frenos' });
});
after(() => pool.end());

describe('Panel de admin', () => {
  test('el login marca quién es admin', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'admin@taller.com', password: 'clave-segura-123' });
    const c = await request(app).post('/api/auth/login').send({ email: 'diego@taller.com', password: 'clave-segura-123' });
    assert.equal(a.body.usuario.admin, true);
    assert.equal(c.body.usuario.admin, false);
  });

  test('un taller común no puede entrar al admin', async () => {
    const res = await request(app).get('/api/admin/resumen').set('Authorization', comun.auth).expect(403);
    assert.equal(res.body.error.codigo, 'SIN_PERMISO');
    await request(app).get('/api/admin/talleres').expect(401);
  });

  test('el resumen junta las métricas de todos los talleres', async () => {
    const res = await request(app).get('/api/admin/resumen').set('Authorization', admin.auth).expect(200);
    const r = res.body;
    assert.equal(r.talleres.total, 2);
    assert.equal(r.talleres.con_ordenes, 1);
    assert.equal(r.talleres.activos_7d, 1);
    assert.equal(r.ordenes.total, 2);
    assert.equal(r.ordenes.entregadas, 1);
    assert.equal(r.ordenes.monto_entregado, '200000.00');
    assert.equal(r.presupuestos.enviados, 1);
    assert.equal(r.presupuestos.aprobados_por_link, 1);
    assert.equal(r.whatsapp.avisos, 1);
    assert.equal(r.ordenes_por_dia.length, 30);
    assert.equal(r.ordenes_por_dia.at(-1).ordenes, 2); // las dos de hoy
  });

  test('lista los talleres con su uso', async () => {
    const res = await request(app).get('/api/admin/talleres').set('Authorization', admin.auth).expect(200);
    const rodriguez = res.body.find((t) => t.nombre === 'Taller Rodríguez');
    const pruebas = res.body.find((t) => t.nombre === 'Mi Taller de Pruebas');
    assert.equal(rodriguez.dueno_email, 'diego@taller.com');
    assert.equal(rodriguez.ordenes, 2);
    assert.equal(rodriguez.en_taller, 1);
    assert.equal(rodriguez.uso, 'activo');
    assert.equal(pruebas.uso, 'sin_arrancar');
  });

  test('crea un taller nuevo desde el panel', async () => {
    const res = await request(app)
      .post('/api/admin/talleres')
      .set('Authorization', admin.auth)
      .send({
        taller: { nombre: 'Taller Chascomús', telefono: '2241 15 68-9216' },
        usuario: { nombre: 'Carlos', email: 'carlos@taller.com', password: 'clave-de-carlos' },
      })
      .expect(201);
    assert.equal(res.body.taller.nombre, 'Taller Chascomús');
    assert.ok(!('token' in res.body)); // no se le entrega al admin una sesión del taller
    await request(app).post('/api/auth/login').send({ email: 'carlos@taller.com', password: 'clave-de-carlos' }).expect(200);
  });

  test('el admin no puede deshabilitar su propio taller', async () => {
    const res = await request(app).patch(`/api/admin/talleres/${admin.tallerId}`).set('Authorization', admin.auth).send({ activo: false }).expect(409);
    assert.equal(res.body.error.codigo, 'PROPIO_TALLER');
  });

  test('deshabilitar un taller le corta el ingreso y la sesión', async () => {
    const lista = await request(app).get('/api/admin/talleres').set('Authorization', admin.auth);
    const id = lista.body.find((t) => t.nombre === 'Taller Rodríguez').id;

    const res = await request(app).patch(`/api/admin/talleres/${id}`).set('Authorization', admin.auth).send({ activo: false }).expect(200);
    assert.equal(res.body.activo, false);

    const login = await request(app).post('/api/auth/login').send({ email: 'diego@taller.com', password: 'clave-segura-123' }).expect(403);
    assert.equal(login.body.error.codigo, 'CUENTA_INACTIVA');
    await request(app).get('/api/auth/me').set('Authorization', comun.auth).expect(401);
    // La sesión que ya tenía abierta también queda cortada para todo lo demás.
    await request(app).get('/api/tablero').set('Authorization', comun.auth).expect(401);
    await request(app).get('/api/ordenes').set('Authorization', comun.auth).expect(401);

    await request(app).patch(`/api/admin/talleres/${id}`).set('Authorization', admin.auth).send({ activo: true }).expect(200);
    await request(app).post('/api/auth/login').send({ email: 'diego@taller.com', password: 'clave-segura-123' }).expect(200);
  });
});

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { recrearBase, crearTaller } = require('./helpers');
const request = require('supertest');
const app = require('../src/app');
const env = require('../src/config/env');
const { pool } = require('../src/db/pool');
const { EJEMPLOS } = require('../src/modules/taller/ejemplos');

const REGISTRO = {
  taller: { nombre: 'Taller El Tano', telefono: '2241 15 68-9216' },
  usuario: { nombre: 'Tano', email: 'tano@taller.com', password: 'clave-segura-123' },
  con_ejemplos: true,
};

let tano;

before(async () => {
  await recrearBase();
  const res = await request(app).post('/api/auth/registro').send(REGISTRO).expect(201);
  tano = { auth: `Bearer ${res.body.token}`, tallerId: res.body.taller.id };
});
after(() => pool.end());

const get = (url, auth) => request(app).get(url).set('Authorization', auth);

describe('Registro con ejemplos', () => {
  test('carga los autos de ejemplo repartidos en el tablero', async () => {
    const res = await get('/api/tablero', tano.auth).expect(200);
    assert.equal(res.body.hay_ejemplos, true);
    // Todos menos el entregado quedan en el taller, uno por columna salvo "recibido".
    assert.equal(res.body.resumen.en_taller, EJEMPLOS.length - 1);
    assert.equal(res.body.resumen.listos, 1);
    assert.equal(res.body.resumen.presupuestos_sin_respuesta, 1);
    assert.equal(res.body.resumen.entregados_hoy, 1);
    for (const col of ['diagnostico', 'esperando_aprobacion', 'en_reparacion', 'listo']) {
      assert.equal(res.body.columnas[col].length, 1, col);
      assert.equal(res.body.columnas[col][0].es_ejemplo, true);
    }
  });

  test('las órdenes tienen presupuesto, total calculado y línea de tiempo', async () => {
    const tablero = await get('/api/tablero', tano.auth);
    const sandero = tablero.body.columnas.esperando_aprobacion[0];
    const orden = await get(`/api/ordenes/${sandero.id}`, tano.auth).expect(200);
    assert.equal(orden.body.presupuesto.estado, 'enviado');
    assert.equal(Number(orden.body.total), 305000);
    assert.equal(orden.body.items.length, 2);
    assert.ok(orden.body.diagnostico);
    assert.ok(orden.body.eventos.length >= 3);
  });

  test('los clientes de ejemplo llevan el WhatsApp del taller', async () => {
    const [filas] = await pool.query('SELECT DISTINCT telefono FROM clientes WHERE taller_id = ?', [tano.tallerId]);
    assert.deepEqual(filas.map((f) => f.telefono), ['5492241689216']);
  });

  test('el entregado de ejemplo queda cobrado y con fecha de entrega', async () => {
    // Se verifica en la base: /api/numeros usa ANY_VALUE, que es de MySQL y no corre en MariaDB.
    const [[o]] = await pool.query(
      `SELECT o.total, o.fecha_entrega, SUM(p.monto) AS pagado
         FROM ordenes o JOIN orden_pagos p ON p.orden_id = o.id
        WHERE o.taller_id = ? AND o.estado = 'entregado' GROUP BY o.id`,
      [tano.tallerId],
    );
    assert.equal(Number(o.total), 38500);
    assert.equal(Number(o.pagado), 38500);
    assert.ok(o.fecha_entrega);
  });

  test('la próxima orden real sigue la numeración', async () => {
    const res = await request(app)
      .post('/api/ordenes')
      .set('Authorization', tano.auth)
      .send({ vehiculo: { patente: 'AB123CD', cliente: { nombre: 'Cliente real' } }, motivo: 'Frenos' })
      .expect(201);
    assert.equal(res.body.numero, EJEMPLOS.length + 1);
  });

  test('sin el flag no se cargan ejemplos (alta desde admin y tests)', async () => {
    const otro = await crearTaller(app, 'Taller Sin Ejemplos', 'sin@taller.com');
    const res = await get('/api/tablero', otro.auth).expect(200);
    assert.equal(res.body.hay_ejemplos, false);
    assert.equal(res.body.resumen.en_taller, 0);
  });
});

describe('DELETE /api/taller/ejemplos', () => {
  test('un mecánico no puede borrarlos', async () => {
    const hash = await bcrypt.hash('clave-segura-123', 4);
    await pool.query(
      "INSERT INTO usuarios (taller_id, nombre, email, password_hash, rol) VALUES (?, 'Mecánico', 'meca@taller.com', ?, 'mecanico')",
      [tano.tallerId, hash],
    );
    const login = await request(app).post('/api/auth/login').send({ email: 'meca@taller.com', password: 'clave-segura-123' });
    await request(app).delete('/api/taller/ejemplos').set('Authorization', `Bearer ${login.body.token}`).expect(403);
  });

  test('el dueño los borra y deja intacto lo real', async () => {
    const res = await request(app).delete('/api/taller/ejemplos').set('Authorization', tano.auth).expect(200);
    assert.equal(res.body.borrados, EJEMPLOS.length);

    const tablero = await get('/api/tablero', tano.auth);
    assert.equal(tablero.body.hay_ejemplos, false);
    assert.equal(tablero.body.resumen.en_taller, 1); // la orden real de Frenos
    assert.equal(tablero.body.resumen.entregados_hoy, 0);

    const [[cuentas]] = await pool.query(
      `SELECT (SELECT COUNT(*) FROM clientes WHERE taller_id = ?) AS clientes,
              (SELECT COUNT(*) FROM vehiculos WHERE taller_id = ?) AS vehiculos,
              (SELECT COUNT(*) FROM orden_pagos WHERE taller_id = ?) AS pagos`,
      [tano.tallerId, tano.tallerId, tano.tallerId],
    );
    assert.deepEqual({ ...cuentas }, { clientes: 1, vehiculos: 1, pagos: 0 });
  });

  test('borrar de nuevo no rompe', async () => {
    const res = await request(app).delete('/api/taller/ejemplos').set('Authorization', tano.auth).expect(200);
    assert.equal(res.body.borrados, 0);
  });

  test('si no quedan órdenes, la numeración vuelve a 1', async () => {
    const res = await request(app)
      .post('/api/auth/registro')
      .send({ ...REGISTRO, usuario: { ...REGISTRO.usuario, email: 'solo-ejemplos@taller.com' } })
      .expect(201);
    const auth = `Bearer ${res.body.token}`;
    await request(app).delete('/api/taller/ejemplos').set('Authorization', auth).expect(200);
    const orden = await request(app)
      .post('/api/ordenes')
      .set('Authorization', auth)
      .send({ vehiculo: { patente: 'AE418RT', cliente: { nombre: 'Primer cliente' } }, motivo: 'Service' })
      .expect(201);
    assert.equal(orden.body.numero, 1);
  });

  test('no toca los ejemplos de otro taller', async () => {
    const a = await request(app)
      .post('/api/auth/registro')
      .send({ ...REGISTRO, usuario: { ...REGISTRO.usuario, email: 'a@taller.com' } });
    const b = await request(app)
      .post('/api/auth/registro')
      .send({ ...REGISTRO, usuario: { ...REGISTRO.usuario, email: 'b@taller.com' } });
    await request(app).delete('/api/taller/ejemplos').set('Authorization', `Bearer ${a.body.token}`).expect(200);
    const tablero = await get('/api/tablero', `Bearer ${b.body.token}`);
    assert.equal(tablero.body.hay_ejemplos, true);
  });
});

describe('Aviso de registro nuevo', () => {
  test('manda la notificación con los datos del taller', async () => {
    const original = { url: env.AVISO_REGISTRO_URL, fetch: global.fetch };
    const llamadas = [];
    env.AVISO_REGISTRO_URL = 'https://ntfy.sh/tema-de-prueba';
    global.fetch = async (url, opciones) => {
      llamadas.push({ url, opciones });
      return { ok: true };
    };
    try {
      await request(app)
        .post('/api/auth/registro')
        .send({ ...REGISTRO, usuario: { ...REGISTRO.usuario, email: 'aviso@taller.com' } })
        .expect(201);
      await new Promise((r) => setTimeout(r, 50)); // el aviso sale después de responder
      assert.equal(llamadas.length, 1);
      assert.equal(llamadas[0].url, 'https://ntfy.sh/tema-de-prueba');
      assert.match(llamadas[0].opciones.body, /Taller El Tano/);
      assert.match(llamadas[0].opciones.body, /aviso@taller\.com/);
      assert.equal(llamadas[0].opciones.headers.Click, 'https://wa.me/5492241689216');
    } finally {
      env.AVISO_REGISTRO_URL = original.url;
      global.fetch = original.fetch;
    }
  });

  test('si el aviso falla, el registro igual sale bien', async () => {
    const original = { url: env.AVISO_REGISTRO_URL, fetch: global.fetch };
    env.AVISO_REGISTRO_URL = 'https://ntfy.sh/tema-de-prueba';
    global.fetch = async () => {
      throw new Error('sin internet');
    };
    const errorOriginal = console.error;
    console.error = () => {};
    try {
      await request(app)
        .post('/api/auth/registro')
        .send({ ...REGISTRO, usuario: { ...REGISTRO.usuario, email: 'falla@taller.com' } })
        .expect(201);
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      env.AVISO_REGISTRO_URL = original.url;
      global.fetch = original.fetch;
      console.error = errorOriginal;
    }
  });

  test('sin AVISO_REGISTRO_URL no intenta mandar nada', async () => {
    const original = global.fetch;
    let llamado = false;
    global.fetch = async () => {
      llamado = true;
      return { ok: true };
    };
    try {
      await request(app)
        .post('/api/auth/registro')
        .send({ ...REGISTRO, usuario: { ...REGISTRO.usuario, email: 'sin-aviso@taller.com' } })
        .expect(201);
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(llamado, false);
    } finally {
      global.fetch = original;
    }
  });
});

describe('Panel de admin', () => {
  test('los ejemplos no cuentan como uso real', async () => {
    const admin = await crearTaller(app, 'Admin', 'admin@taller.com');
    await request(app)
      .post('/api/auth/registro')
      .send({ ...REGISTRO, taller: { ...REGISTRO.taller, nombre: 'Recién Llegado' }, usuario: { ...REGISTRO.usuario, email: 'nuevo@taller.com' } })
      .expect(201);

    const talleres = await get('/api/admin/talleres', admin.auth).expect(200);
    const nuevo = talleres.body.find((t) => t.nombre === 'Recién Llegado');
    assert.equal(nuevo.ordenes, 0);
    assert.equal(nuevo.en_taller, 0);
    assert.equal(nuevo.vehiculos, 0);
    assert.equal(Number(nuevo.monto_entregado), 0);
    assert.equal(nuevo.uso, 'sin_arrancar');

    const resumen = await get('/api/admin/resumen', admin.auth).expect(200);
    const [[reales]] = await pool.query(
      'SELECT COUNT(*) AS n FROM ordenes o JOIN clientes c ON c.id = o.cliente_id WHERE c.es_ejemplo = 0',
    );
    assert.equal(resumen.body.ordenes.total, reales.n);
  });
});

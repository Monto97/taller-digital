/**
 * Borra los datos de prueba de UN taller: órdenes, vehículos, clientes y
 * services programados anteriores a una fecha. El taller, sus usuarios y la
 * conexión con Mercado Pago no se tocan. Los demás talleres tampoco.
 *
 * Por defecto solo SIMULA: muestra qué borraría y qué queda. Para borrar de
 * verdad hay que agregar --confirmar. Antes de borrar guarda una copia de
 * todas las filas en backend/backups/ (JSON).
 *
 *   node scripts/limpiar-datos-viejos.js --email vos@mail.com
 *   node scripts/limpiar-datos-viejos.js --email vos@mail.com --ordenes 6,12,17,18
 *   node scripts/limpiar-datos-viejos.js --email vos@mail.com --ordenes 6,12,17,18 --confirmar
 *
 * Opciones:
 *   --email <email>           Usuario del taller a limpiar (o --taller <id>).
 *   --conservar-desde <fecha> Fecha AAAA-MM-DD (hora argentina). Se borra todo lo
 *                             anterior. Por defecto, hoy.
 *   --ordenes 6,12,...        Números de orden a borrar aunque sean de hoy.
 *   --confirmar               Borra de verdad (sin esto, solo simula).
 *
 * Contra la base de producción (Railway): copiá MYSQL_PUBLIC_URL del servicio
 * de MySQL y pasala en DATABASE_URL:
 *   $env:DATABASE_URL = "mysql://root:...@....proxy.rlwy.net:12345/railway"
 * Sin DATABASE_URL usa las variables DB_* del .env (base local).
 */
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

function leerArgs(argv) {
  const args = { confirmar: false, ordenes: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--confirmar') args.confirmar = true;
    else if (a === '--email') args.email = String(argv[++i] || '').trim().toLowerCase();
    else if (a === '--taller') args.taller = Number(argv[++i]);
    else if (a === '--conservar-desde') args.desde = argv[++i];
    else if (a === '--ordenes') {
      args.ordenes = String(argv[++i] || '').split(',').map((n) => Number(n.trim())).filter((n) => Number.isInteger(n) && n > 0);
    } else {
      throw new Error(`Opción desconocida: ${a}`);
    }
  }
  if (!args.email && !Number.isInteger(args.taller)) {
    throw new Error('Indicá el taller con --email <email del usuario> o --taller <id>.');
  }
  if (args.desde && !/^\d{4}-\d{2}-\d{2}$/.test(args.desde)) {
    throw new Error('--conservar-desde tiene que tener el formato AAAA-MM-DD.');
  }
  return args;
}

async function conectar() {
  if (process.env.DATABASE_URL) {
    return mysql.createConnection({ uri: process.env.DATABASE_URL, timezone: 'Z' });
  }
  const env = require('../src/config/env');
  return mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    socketPath: env.DB_SOCKET || undefined,
    timezone: 'Z',
  });
}

/** Hoy en Argentina (UTC-3, sin horario de verano), como AAAA-MM-DD. */
function hoyAr() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

const fechaAr = (d) => (d ? new Date(new Date(d).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ') : '—');
const ids = (filas) => filas.map((f) => f.id);
// "IN ()" no es SQL válido: con lista vacía usamos un id que no existe.
const lista = (arr) => (arr.length > 0 ? arr : [0]);

async function main() {
  const args = leerArgs(process.argv.slice(2));
  const conn = await conectar();

  try {
    // --- Taller ---
    let tallerId = args.taller;
    if (args.email) {
      const [u] = await conn.query('SELECT taller_id FROM usuarios WHERE email = ?', [args.email]);
      if (!u[0]) throw new Error(`No hay ningún usuario con el email ${args.email}.`);
      tallerId = u[0].taller_id;
    }
    const [[taller]] = await conn.query('SELECT id, nombre FROM talleres WHERE id = ?', [tallerId]);
    if (!taller) throw new Error(`No existe el taller ${tallerId}.`);

    const desde = args.desde || hoyAr();
    // Medianoche argentina de esa fecha = 03:00 UTC.
    const corte = `${desde} 03:00:00`;

    console.log(`\nTaller: "${taller.nombre}" (id ${taller.id})`);
    console.log(`Se conserva lo cargado desde el ${desde} (hora argentina). Se borra lo anterior.`);
    if (args.ordenes.length) console.log(`También se borran las órdenes n.º ${args.ordenes.join(', ')}.`);

    // --- Qué se borra ---
    const [ordenes] = await conn.query(
      `SELECT o.id, o.numero, o.estado, o.total, o.fecha_ingreso, o.fecha_entrega, o.vehiculo_id, o.cliente_id,
              v.patente, v.marca, v.modelo, c.nombre AS cliente
         FROM ordenes o
         JOIN vehiculos v ON v.id = o.vehiculo_id
         JOIN clientes c ON c.id = o.cliente_id
        WHERE o.taller_id = ?
          AND (o.fecha_ingreso < ? OR o.created_at < ? OR o.fecha_entrega < ? OR o.numero IN (?))
        ORDER BY o.numero`,
      [tallerId, corte, corte, corte, lista(args.ordenes)],
    );
    const ordenIds = ids(ordenes);

    const [quedan] = await conn.query(
      `SELECT o.id, o.numero, o.estado, o.vehiculo_id, o.cliente_id, v.patente
         FROM ordenes o JOIN vehiculos v ON v.id = o.vehiculo_id
        WHERE o.taller_id = ? AND o.id NOT IN (?)
        ORDER BY o.numero`,
      [tallerId, lista(ordenIds)],
    );
    const vehiculosEnUso = [...new Set(quedan.map((o) => o.vehiculo_id))];
    const clientesEnUso = [...new Set(quedan.map((o) => o.cliente_id))];

    // Vehículos viejos (o que solo tenían órdenes borradas) que no quedan con ninguna orden.
    const [vehiculos] = await conn.query(
      `SELECT id, patente, marca, modelo, cliente_id FROM vehiculos
        WHERE taller_id = ? AND id NOT IN (?)
          AND (created_at < ? OR id IN (?))
        ORDER BY patente`,
      [tallerId, lista(vehiculosEnUso), corte, lista([...new Set(ordenes.map((o) => o.vehiculo_id))])],
    );
    const vehiculoIds = ids(vehiculos);

    const [vehiculosQuedan] = await conn.query(
      'SELECT id, cliente_id FROM vehiculos WHERE taller_id = ? AND id NOT IN (?)',
      [tallerId, lista(vehiculoIds)],
    );
    const clientesConVehiculo = vehiculosQuedan.map((v) => v.cliente_id);

    const clientesCandidatos = [...new Set([...ordenes.map((o) => o.cliente_id), ...vehiculos.map((v) => v.cliente_id)])];
    const [clientes] = await conn.query(
      `SELECT id, nombre, telefono FROM clientes
        WHERE taller_id = ? AND id NOT IN (?)
          AND (created_at < ? OR id IN (?))
        ORDER BY nombre`,
      [tallerId, lista([...new Set([...clientesEnUso, ...clientesConVehiculo])]), corte, lista(clientesCandidatos)],
    );
    const clienteIds = ids(clientes);

    const [servicios] = await conn.query(
      `SELECT id FROM servicios_programados
        WHERE taller_id = ? AND (created_at < ? OR vehiculo_id IN (?) OR orden_origen_id IN (?))`,
      [tallerId, corte, lista(vehiculoIds), lista(ordenIds)],
    );
    const servicioIds = ids(servicios);

    // Las tablas de pagos se suman con migraciones: si alguna no está, se saltea.
    const [tablas] = await conn.query(
      `SELECT TABLE_NAME AS t FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('orden_pagos', 'orden_pagos_mp')`,
    );
    const TABLAS_HIJAS = ['orden_pagos_mp', 'orden_pagos', 'orden_items', 'orden_eventos']
      .filter((t) => !t.startsWith('orden_pagos') || tablas.some((f) => f.t === t));

    const hijos = { orden_items: 0, orden_eventos: 0, orden_pagos: 0, orden_pagos_mp: 0 };
    for (const tabla of TABLAS_HIJAS) {
      const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM ${tabla} WHERE orden_id IN (?)`, [lista(ordenIds)]);
      hijos[tabla] = Number(n);
    }

    // --- Resumen ---
    console.log(`\nÓrdenes a borrar (${ordenes.length}):`);
    for (const o of ordenes) {
      const auto = [o.marca, o.modelo].filter(Boolean).join(' ') || 'sin marca';
      console.log(
        `  #${o.numero}  ${o.patente}  ${auto}  · ${o.cliente}  · ${o.estado}  · $${o.total}` +
        `  · ingreso ${fechaAr(o.fecha_ingreso)}  · entrega ${fechaAr(o.fecha_entrega)}`,
      );
    }
    const faltan = args.ordenes.filter((n) => !ordenes.some((o) => o.numero === n));
    if (faltan.length) console.log(`  (No existen en este taller: n.º ${faltan.join(', ')})`);

    console.log(`\nVehículos a borrar (${vehiculos.length}): ${vehiculos.map((v) => v.patente).join(', ') || '—'}`);
    console.log(`Clientes a borrar (${clientes.length}): ${clientes.map((c) => c.nombre).join(', ') || '—'}`);
    console.log(`Services programados a borrar: ${servicioIds.length}`);
    console.log(
      `Junto con las órdenes: ${hijos.orden_items} ítems, ${hijos.orden_eventos} eventos, ` +
      `${hijos.orden_pagos} pagos, ${hijos.orden_pagos_mp} intentos de pago MP.`,
    );
    console.log(`\nQuedan ${quedan.length} órdenes: ${quedan.map((o) => `#${o.numero} ${o.patente} (${o.estado})`).join(', ') || '—'}`);

    if (!args.confirmar) {
      console.log('\nSIMULACIÓN: no se borró nada. Si está bien, repetí el comando con --confirmar.\n');
      return;
    }

    if (ordenIds.length + vehiculoIds.length + clienteIds.length + servicioIds.length === 0) {
      console.log('\nNo hay nada para borrar.\n');
      return;
    }

    // --- Copia de seguridad ---
    const copia = { taller, conservar_desde: desde, generado: new Date().toISOString() };
    const volcar = async (tabla, columna, valores) => {
      const [filas] = await conn.query(`SELECT * FROM ${tabla} WHERE ${columna} IN (?)`, [lista(valores)]);
      copia[tabla] = filas;
    };
    await volcar('servicios_programados', 'id', servicioIds);
    for (const tabla of TABLAS_HIJAS) await volcar(tabla, 'orden_id', ordenIds);
    await volcar('ordenes', 'id', ordenIds);
    await volcar('vehiculos', 'id', vehiculoIds);
    await volcar('clientes', 'id', clienteIds);

    const carpeta = path.join(__dirname, '../backups');
    fs.mkdirSync(carpeta, { recursive: true });
    const archivo = path.join(carpeta, `limpieza-taller-${taller.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(archivo, JSON.stringify(copia, null, 2));
    console.log(`\nCopia de seguridad: ${archivo}`);

    // --- Borrado, todo o nada ---
    // Se borran los hijos a mano aunque haya ON DELETE CASCADE, por si alguna
    // tabla de producción se creó sin la cascada.
    await conn.beginTransaction();
    try {
      await conn.query('DELETE FROM servicios_programados WHERE id IN (?)', [lista(servicioIds)]);
      // orden_pagos_mp va antes que orden_pagos porque apunta a sus filas.
      for (const tabla of TABLAS_HIJAS) {
        await conn.query(`DELETE FROM ${tabla} WHERE orden_id IN (?)`, [lista(ordenIds)]);
      }
      await conn.query('DELETE FROM ordenes WHERE taller_id = ? AND id IN (?)', [tallerId, lista(ordenIds)]);
      await conn.query('DELETE FROM vehiculos WHERE taller_id = ? AND id IN (?)', [tallerId, lista(vehiculoIds)]);
      await conn.query('DELETE FROM clientes WHERE taller_id = ? AND id IN (?)', [tallerId, lista(clienteIds)]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }

    console.log(
      `Listo: se borraron ${ordenIds.length} órdenes, ${vehiculoIds.length} vehículos, ` +
      `${clienteIds.length} clientes y ${servicioIds.length} services programados.\n`,
    );
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}\n`);
  process.exitCode = 1;
});

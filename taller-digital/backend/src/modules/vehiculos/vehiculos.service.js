const { pool, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { respuestaPaginada } = require('../../utils/esquemas');
const { normalizarPatente } = require('../../utils/formato');
const clientesService = require('../clientes/clientes.service');
const { ESTADOS_ACTIVOS } = require('../ordenes/ordenes.estados');

const SELECT_VEHICULO = `
  SELECT v.id, v.patente, v.tipo, v.marca, v.modelo, v.anio, v.color, v.km_actual, v.notas,
         v.created_at, v.updated_at,
         c.id AS cliente_id, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono
    FROM vehiculos v
    JOIN clientes c ON c.id = v.cliente_id`;

/** Arma el objeto de respuesta con el cliente anidado. */
function formatear(fila) {
  const { cliente_id, cliente_nombre, cliente_telefono, ...vehiculo } = fila;
  return { ...vehiculo, cliente: { id: cliente_id, nombre: cliente_nombre, telefono: cliente_telefono } };
}

function errorPatenteDuplicada(vehiculoId) {
  return new AppError(
    409,
    'PATENTE_DUPLICADA',
    'Ya hay un vehículo con esa patente en el taller.',
    vehiculoId ? { vehiculo_id: vehiculoId } : undefined,
  );
}

async function idPorPatente(conn, tallerId, patente) {
  const [filas] = await conn.query('SELECT id FROM vehiculos WHERE taller_id = ? AND patente = ?', [tallerId, patente]);
  return filas[0]?.id;
}

async function buscarOFallar(conn, tallerId, id) {
  const [filas] = await conn.query(
    `${SELECT_VEHICULO} WHERE v.id = ? AND v.taller_id = ? AND v.deleted_at IS NULL`,
    [id, tallerId],
  );
  if (!filas[0]) throw AppError.noEncontrado('El vehículo');
  return formatear(filas[0]);
}

async function listar(tallerId, { q, tipo, cliente_id, pagina, por_pagina }) {
  const condiciones = ['v.taller_id = ?', 'v.deleted_at IS NULL'];
  const params = [tallerId];

  if (q) {
    const comoPatente = normalizarPatente(q);
    condiciones.push('(v.patente LIKE ? OR v.marca LIKE ? OR v.modelo LIKE ? OR c.nombre LIKE ?)');
    params.push(`%${comoPatente || q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (tipo) {
    condiciones.push('v.tipo = ?');
    params.push(tipo);
  }
  if (cliente_id) {
    condiciones.push('v.cliente_id = ?');
    params.push(cliente_id);
  }
  const where = condiciones.join(' AND ');

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM vehiculos v JOIN clientes c ON c.id = v.cliente_id WHERE ${where}`,
    params,
  );
  const [filas] = await pool.query(
    `${SELECT_VEHICULO} WHERE ${where} ORDER BY v.updated_at DESC LIMIT ? OFFSET ?`,
    [...params, por_pagina, (pagina - 1) * por_pagina],
  );

  return respuestaPaginada(filas.map(formatear), total, { pagina, por_pagina });
}

async function obtener(tallerId, id) {
  const vehiculo = await buscarOFallar(pool, tallerId, id);

  const [[resumen]] = await pool.query(
    `SELECT COUNT(*) AS visitas, MAX(fecha_ingreso) AS ultima_visita
       FROM ordenes WHERE vehiculo_id = ? AND taller_id = ? AND estado <> 'cancelada'`,
    [id, tallerId],
  );
  const [activas] = await pool.query(
    `SELECT id, numero, estado, fecha_ingreso FROM ordenes
      WHERE vehiculo_id = ? AND taller_id = ? AND estado IN (?)
      ORDER BY fecha_ingreso DESC LIMIT 1`,
    [id, tallerId, ESTADOS_ACTIVOS],
  );
  const [servicios] = await pool.query(
    `SELECT id, descripcion, fecha_estimada, km_estimado, estado FROM servicios_programados
      WHERE vehiculo_id = ? AND taller_id = ? AND estado IN ('pendiente', 'avisado')
      ORDER BY fecha_estimada IS NULL, fecha_estimada, km_estimado LIMIT 1`,
    [id, tallerId],
  );

  return {
    ...vehiculo,
    visitas: resumen.visitas,
    ultima_visita: resumen.ultima_visita,
    orden_activa: activas[0] ?? null,
    proximo_servicio: servicios[0] ?? null,
  };
}

/** Búsqueda exacta por patente: la entrada principal del mostrador. */
async function obtenerPorPatente(tallerId, patente) {
  const id = await idPorPatente(pool, tallerId, patente);
  if (!id) throw AppError.noEncontrado('El vehículo');
  return obtener(tallerId, id);
}

/**
 * Crea el vehículo (y el cliente, si viene nuevo) usando la conexión recibida.
 * Se expone para que órdenes pueda crearlo dentro de su propia transacción.
 * Devuelve { vehiculoId, clienteId }.
 */
async function crearConConexion(conn, tallerId, datos) {
  const { cliente_id: clienteIdExistente, cliente, formato_libre: _ignorar, ...vehiculo } = datos;

  const existente = await idPorPatente(conn, tallerId, vehiculo.patente);
  if (existente) throw errorPatenteDuplicada(existente);

  let clienteId = clienteIdExistente;
  if (clienteId) {
    await clientesService.buscarOFallar(conn, tallerId, clienteId);
  } else {
    clienteId = await clientesService.crearConConexion(conn, tallerId, cliente);
  }

  try {
    const [res] = await conn.query(
      `INSERT INTO vehiculos (taller_id, cliente_id, patente, tipo, marca, modelo, anio, color, km_actual, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tallerId, clienteId, vehiculo.patente, vehiculo.tipo ?? 'auto', vehiculo.marca ?? null, vehiculo.modelo ?? null,
        vehiculo.anio ?? null, vehiculo.color ?? null, vehiculo.km_actual ?? null, vehiculo.notas ?? null,
      ],
    );
    return { vehiculoId: res.insertId, clienteId };
  } catch (err) {
    // Carrera: otro usuario cargó la misma patente entre el chequeo y el INSERT.
    if (err.code === 'ER_DUP_ENTRY') throw errorPatenteDuplicada();
    throw err;
  }
}

async function crear(tallerId, datos) {
  const { vehiculoId } = await withTransaction((conn) => crearConConexion(conn, tallerId, datos));
  return obtener(tallerId, vehiculoId);
}

async function editar(tallerId, id, datos) {
  const { formato_libre: _ignorar, ...cambios } = datos;
  const actual = await buscarOFallar(pool, tallerId, id);

  if (cambios.cliente_id && cambios.cliente_id !== actual.cliente.id) {
    await clientesService.buscarOFallar(pool, tallerId, cambios.cliente_id);
  }
  if (cambios.patente && cambios.patente !== actual.patente) {
    const otro = await idPorPatente(pool, tallerId, cambios.patente);
    if (otro) throw errorPatenteDuplicada(otro);
  }

  const campos = Object.keys(cambios);
  if (campos.length > 0) {
    try {
      await pool.query(
        `UPDATE vehiculos SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND taller_id = ?`,
        [...campos.map((c) => cambios[c]), id, tallerId],
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw errorPatenteDuplicada();
      throw err;
    }
  }
  return obtener(tallerId, id);
}

/** Todas las órdenes del vehículo (salvo canceladas) con sus ítems, de la más nueva a la más vieja. */
async function historial(tallerId, id) {
  const vehiculo = await buscarOFallar(pool, tallerId, id);

  const [ordenes] = await pool.query(
    `SELECT o.id, o.numero, o.estado, o.fecha_ingreso, o.fecha_entrega, o.km_ingreso,
            o.motivo, o.diagnostico, o.total, o.presupuesto_estado,
            u.nombre AS mecanico
       FROM ordenes o
       LEFT JOIN usuarios u ON u.id = o.mecanico_id
      WHERE o.vehiculo_id = ? AND o.taller_id = ? AND o.estado <> 'cancelada'
      ORDER BY o.fecha_ingreso DESC`,
    [id, tallerId],
  );

  const itemsPorOrden = new Map(ordenes.map((o) => [o.id, []]));
  if (ordenes.length > 0) {
    const [items] = await pool.query(
      `SELECT id, orden_id, tipo, descripcion, cantidad, precio_unitario
         FROM orden_items WHERE orden_id IN (?) ORDER BY orden_id, posicion, id`,
      [ordenes.map((o) => o.id)],
    );
    for (const { orden_id: ordenId, ...item } of items) itemsPorOrden.get(ordenId).push(item);
  }

  return {
    vehiculo,
    ordenes: ordenes.map((o) => ({ ...o, items: itemsPorOrden.get(o.id) })),
  };
}

module.exports = {
  listar, obtener, obtenerPorPatente, crear, editar, historial, buscarOFallar, crearConConexion,
};

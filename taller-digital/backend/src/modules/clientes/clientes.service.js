const { pool } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { respuestaPaginada } = require('../../utils/esquemas');

const COLUMNAS = 'c.id, c.nombre, c.telefono, c.email, c.notas, c.created_at, c.updated_at';

/**
 * Crea un cliente usando la conexión recibida. Se expone para que otros
 * módulos (vehículos, órdenes) puedan crearlo dentro de su propia transacción.
 */
async function crearConConexion(conn, tallerId, datos) {
  const [res] = await conn.query(
    'INSERT INTO clientes (taller_id, nombre, telefono, email, notas) VALUES (?, ?, ?, ?, ?)',
    [tallerId, datos.nombre, datos.telefono ?? null, datos.email ?? null, datos.notas ?? null],
  );
  return res.insertId;
}

/** Devuelve el cliente si existe y es del taller; si no, lanza 404. */
async function buscarOFallar(conn, tallerId, id) {
  const [filas] = await conn.query(
    `SELECT ${COLUMNAS} FROM clientes c WHERE c.id = ? AND c.taller_id = ? AND c.deleted_at IS NULL`,
    [id, tallerId],
  );
  if (!filas[0]) throw AppError.noEncontrado('El cliente');
  return filas[0];
}

async function listar(tallerId, { q, pagina, por_pagina }) {
  const condiciones = ['c.taller_id = ?', 'c.deleted_at IS NULL'];
  const params = [tallerId];

  if (q) {
    const digitos = q.replace(/\D/g, '');
    if (digitos.length >= 3) {
      condiciones.push('(c.nombre LIKE ? OR c.telefono LIKE ?)');
      params.push(`%${q}%`, `%${digitos}%`);
    } else {
      condiciones.push('c.nombre LIKE ?');
      params.push(`%${q}%`);
    }
  }
  const where = condiciones.join(' AND ');

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM clientes c WHERE ${where}`, params);
  const [filas] = await pool.query(
    `SELECT ${COLUMNAS},
            (SELECT COUNT(*) FROM vehiculos v WHERE v.cliente_id = c.id AND v.deleted_at IS NULL) AS cantidad_vehiculos
       FROM clientes c
      WHERE ${where}
      ORDER BY c.nombre
      LIMIT ? OFFSET ?`,
    [...params, por_pagina, (pagina - 1) * por_pagina],
  );

  return respuestaPaginada(filas, total, { pagina, por_pagina });
}

async function crear(tallerId, datos) {
  const id = await crearConConexion(pool, tallerId, datos);
  return obtener(tallerId, id);
}

async function obtener(tallerId, id) {
  const cliente = await buscarOFallar(pool, tallerId, id);
  const [vehiculos] = await pool.query(
    `SELECT id, patente, tipo, marca, modelo, anio, km_actual
       FROM vehiculos
      WHERE cliente_id = ? AND taller_id = ? AND deleted_at IS NULL
      ORDER BY patente`,
    [id, tallerId],
  );
  return { ...cliente, vehiculos };
}

async function editar(tallerId, id, datos) {
  await buscarOFallar(pool, tallerId, id);

  const campos = Object.keys(datos);
  const sets = campos.map((c) => `${c} = ?`).join(', ');
  await pool.query(
    `UPDATE clientes SET ${sets} WHERE id = ? AND taller_id = ?`,
    [...campos.map((c) => datos[c]), id, tallerId],
  );
  return obtener(tallerId, id);
}

async function eliminar(tallerId, id) {
  await buscarOFallar(pool, tallerId, id);

  const [[{ cantidad }]] = await pool.query(
    'SELECT COUNT(*) AS cantidad FROM vehiculos WHERE cliente_id = ? AND taller_id = ? AND deleted_at IS NULL',
    [id, tallerId],
  );
  if (cantidad > 0) {
    throw AppError.conflicto(
      'CLIENTE_CON_VEHICULOS',
      'El cliente tiene vehículos a su nombre. Pasalos a otro dueño antes de eliminarlo.',
    );
  }

  await pool.query('UPDATE clientes SET deleted_at = UTC_TIMESTAMP() WHERE id = ? AND taller_id = ?', [id, tallerId]);
}

module.exports = { listar, crear, obtener, editar, eliminar, crearConConexion, buscarOFallar };

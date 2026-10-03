const { pool, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { ETIQUETAS } = require('../ordenes/ordenes.estados');
const { generarPdf, tipoPorEstado } = require('../ordenes/orden-pdf');

/**
 * Lo que ve el cliente desde el link de WhatsApp. Solo lo necesario:
 * nada de notas internas, mecánicos ni datos de otros clientes.
 */

async function ordenPorToken(conn, token, { forUpdate = false } = {}) {
  const [filas] = await conn.query(
    `SELECT * FROM ordenes WHERE token_publico = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [token],
  );
  // Mismo 404 para un token que no existe o mal formado: no se revela nada.
  if (!filas[0]) throw AppError.noEncontrado('La orden');
  return filas[0];
}

async function obtener(token) {
  const orden = await ordenPorToken(pool, token);

  const [[datos]] = await pool.query(
    `SELECT t.nombre AS taller_nombre, t.telefono AS taller_telefono, t.direccion AS taller_direccion,
            t.logo_url AS taller_logo_url,
            v.patente, v.tipo, v.marca, v.modelo,
            c.nombre AS cliente_nombre
       FROM ordenes o
       JOIN talleres t ON t.id = o.taller_id
       JOIN vehiculos v ON v.id = o.vehiculo_id
       JOIN clientes c ON c.id = o.cliente_id
      WHERE o.id = ?`,
    [orden.id],
  );

  // El presupuesto se muestra recién cuando el taller lo envió.
  let presupuesto = null;
  if (orden.presupuesto_estado !== 'borrador') {
    const [items] = await pool.query(
      `SELECT tipo, descripcion, cantidad, precio_unitario, ROUND(cantidad * precio_unitario, 2) AS subtotal
         FROM orden_items WHERE orden_id = ? ORDER BY posicion, id`,
      [orden.id],
    );
    presupuesto = {
      estado: orden.presupuesto_estado,
      total: orden.total,
      enviado_at: orden.presupuesto_enviado_at,
      respondido_at: orden.presupuesto_respondido_at,
      items,
    };
  }

  const [eventos] = await pool.query(
    `SELECT tipo, estado_hasta, created_at FROM orden_eventos
      WHERE orden_id = ? AND tipo IN ('creada', 'cambio_estado')
      ORDER BY created_at, id`,
    [orden.id],
  );

  return {
    taller: {
      nombre: datos.taller_nombre,
      telefono: datos.taller_telefono,
      direccion: datos.taller_direccion,
      logo_url: datos.taller_logo_url,
    },
    cliente: { nombre: datos.cliente_nombre.trim().split(/\s+/)[0] },
    orden: {
      numero: orden.numero,
      estado: orden.estado,
      estado_etiqueta: ETIQUETAS[orden.estado],
      motivo: orden.motivo,
      fecha_ingreso: orden.fecha_ingreso,
      fecha_estimada_entrega: orden.fecha_estimada_entrega,
      fecha_entrega: orden.fecha_entrega,
    },
    vehiculo: { patente: datos.patente, tipo: datos.tipo, marca: datos.marca, modelo: datos.modelo },
    presupuesto,
    linea_de_tiempo: eventos.map((e) => ({ estado: e.estado_hasta, fecha: e.created_at })),
  };
}

/** Valida que el presupuesto esté esperando respuesta; si no, 409. */
function exigirEsperandoRespuesta(orden) {
  if (orden.presupuesto_estado !== 'enviado' || orden.estado !== 'esperando_aprobacion') {
    const mensajes = {
      aprobado: 'Este presupuesto ya fue aprobado.',
      rechazado: 'Este presupuesto ya fue respondido.',
      borrador: 'El taller está actualizando el presupuesto. Te van a mandar uno nuevo.',
    };
    throw AppError.conflicto(
      'PRESUPUESTO_BLOQUEADO',
      mensajes[orden.presupuesto_estado] || 'Este presupuesto ya no se puede responder.',
    );
  }
}

async function aprobar(token) {
  await withTransaction(async (conn) => {
    const orden = await ordenPorToken(conn, token, { forUpdate: true });
    exigirEsperandoRespuesta(orden);

    await conn.query(
      `UPDATE ordenes SET presupuesto_estado = 'aprobado', presupuesto_respondido_at = UTC_TIMESTAMP(),
              estado = 'en_reparacion'
        WHERE id = ?`,
      [orden.id],
    );
    // usuario_id NULL = lo hizo el cliente.
    await conn.query(
      `INSERT INTO orden_eventos (orden_id, usuario_id, tipo, detalle) VALUES (?, NULL, 'presupuesto_aprobado', 'Aprobado por el cliente')`,
      [orden.id],
    );
    await conn.query(
      `INSERT INTO orden_eventos (orden_id, usuario_id, tipo, estado_desde, estado_hasta)
       VALUES (?, NULL, 'cambio_estado', ?, 'en_reparacion')`,
      [orden.id, orden.estado],
    );
  });
  return obtener(token);
}

async function rechazar(token, { motivo }) {
  await withTransaction(async (conn) => {
    const orden = await ordenPorToken(conn, token, { forUpdate: true });
    exigirEsperandoRespuesta(orden);

    await conn.query(
      `UPDATE ordenes SET presupuesto_estado = 'rechazado', presupuesto_respondido_at = UTC_TIMESTAMP(),
              estado = 'diagnostico'
        WHERE id = ?`,
      [orden.id],
    );
    await conn.query(
      `INSERT INTO orden_eventos (orden_id, usuario_id, tipo, detalle) VALUES (?, NULL, 'presupuesto_rechazado', ?)`,
      [orden.id, motivo ?? null],
    );
    await conn.query(
      `INSERT INTO orden_eventos (orden_id, usuario_id, tipo, estado_desde, estado_hasta)
       VALUES (?, NULL, 'cambio_estado', ?, 'diagnostico')`,
      [orden.id, orden.estado],
    );
  });
  return obtener(token);
}

/**
 * PDF del comprobante por token: el mismo que ve el taller, bajable sin login.
 * El cliente llega acá desde el link que le mandan por WhatsApp.
 */
async function pdfPorToken(token, tipo) {
  const orden = await ordenPorToken(pool, token);

  const [[datos]] = await pool.query(
    `SELECT o.motivo, o.diagnostico,
            c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
            v.patente, v.tipo AS vehiculo_tipo, v.marca, v.modelo, v.anio, v.km_actual,
            t.nombre AS taller_nombre, t.telefono AS taller_telefono,
            t.direccion AS taller_direccion, t.logo_url AS taller_logo
       FROM ordenes o
       JOIN clientes c ON c.id = o.cliente_id
       JOIN vehiculos v ON v.id = o.vehiculo_id
       JOIN talleres t ON t.id = o.taller_id
      WHERE o.id = ?`,
    [orden.id],
  );
  const [items] = await pool.query(
    `SELECT tipo, descripcion, cantidad, precio_unitario
       FROM orden_items WHERE orden_id = ? ORDER BY posicion, id`,
    [orden.id],
  );

  const tipoResuelto = tipo ?? tipoPorEstado(orden.estado);
  const buffer = await generarPdf({
    taller: { nombre: datos.taller_nombre, telefono: datos.taller_telefono, direccion: datos.taller_direccion, logo_url: datos.taller_logo },
    orden: { numero: orden.numero, motivo: datos.motivo, diagnostico: datos.diagnostico, fecha_ingreso: orden.fecha_ingreso },
    cliente: { nombre: datos.cliente_nombre, telefono: datos.cliente_telefono },
    vehiculo: { patente: datos.patente, tipo: datos.vehiculo_tipo, marca: datos.marca, modelo: datos.modelo, anio: datos.anio, km_actual: datos.km_actual },
    items,
    tipo: tipoResuelto,
  });
  return { buffer, numero: orden.numero, tipo: tipoResuelto, patente: datos.patente };
}

module.exports = { obtener, aprobar, rechazar, pdfPorToken };

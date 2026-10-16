const crypto = require('node:crypto');
const { pool, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { respuestaPaginada } = require('../../utils/esquemas');
const { normalizarPatente } = require('../../utils/formato');
const whatsapp = require('../../utils/whatsapp');
const vehiculosService = require('../vehiculos/vehiculos.service');
const { ESTADOS_ACTIVOS, ESTADOS_CERRADOS, ETIQUETAS, TRANSICIONES, puedeTransicionar } = require('./ordenes.estados');
const { generarPdf, tipoPorEstado } = require('./orden-pdf');

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Trae la fila de la orden si es del taller. Con forUpdate la bloquea hasta el fin de la transacción. */
async function buscarOFallar(conn, tallerId, id, { forUpdate = false } = {}) {
  const [filas] = await conn.query(
    `SELECT * FROM ordenes WHERE id = ? AND taller_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [id, tallerId],
  );
  if (!filas[0]) throw AppError.noEncontrado('La orden');
  return filas[0];
}

function exigirAbierta(orden) {
  if (ESTADOS_CERRADOS.includes(orden.estado)) {
    throw AppError.conflicto('ORDEN_CERRADA', `La orden está ${ETIQUETAS[orden.estado].toLowerCase()} y ya no se puede modificar.`);
  }
}

async function registrarEvento(conn, ordenId, usuarioId, tipo, { desde = null, hasta = null, detalle = null } = {}) {
  await conn.query(
    `INSERT INTO orden_eventos (orden_id, usuario_id, tipo, estado_desde, estado_hasta, detalle)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ordenId, usuarioId, tipo, desde, hasta, detalle],
  );
}

async function cambiarEstadoInterno(conn, orden, nuevoEstado, usuarioId, detalle = null) {
  await conn.query('UPDATE ordenes SET estado = ? WHERE id = ?', [nuevoEstado, orden.id]);
  await registrarEvento(conn, orden.id, usuarioId, 'cambio_estado', { desde: orden.estado, hasta: nuevoEstado, detalle });
}

async function validarMecanico(conn, tallerId, mecanicoId) {
  if (mecanicoId == null) return;
  const [filas] = await conn.query(
    'SELECT id FROM usuarios WHERE id = ? AND taller_id = ? AND activo = 1',
    [mecanicoId, tallerId],
  );
  if (!filas[0]) throw AppError.noEncontrado('El mecánico');
}

/** Si el kilometraje de ingreso es mayor al registrado, actualiza el del vehículo. */
async function actualizarKmVehiculo(conn, vehiculoId, km) {
  if (km == null) return;
  await conn.query(
    'UPDATE vehiculos SET km_actual = ? WHERE id = ? AND (km_actual IS NULL OR km_actual < ?)',
    [km, vehiculoId, km],
  );
}

const ETIQUETAS_MEDIO = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  mercado_pago: 'Mercado Pago',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};

/** Da formato "$ 12.345" para dejar en la bitácora. */
function montoLegible(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return `$ ${valor}`;
  return `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n)}`;
}

/** Suma de pagos NO anulados de una orden. Devuelve número con dos decimales. */
async function pagadoDeOrden(conn, ordenId) {
  const [[fila]] = await conn.query(
    `SELECT COALESCE(SUM(monto), 0) AS pagado
       FROM orden_pagos
      WHERE orden_id = ? AND anulada_at IS NULL`,
    [ordenId],
  );
  return Number(fila.pagado);
}

/** total - pagado, con tolerancia de 1 centavo para evitar falsos saldos. */
function saldoDesde(total, pagado) {
  const diff = Math.round((Number(total) - Number(pagado)) * 100) / 100;
  return Math.abs(diff) < 0.01 ? 0 : diff;
}

async function recalcularTotal(conn, ordenId) {
  await conn.query(
    `UPDATE ordenes
        SET total = (SELECT COALESCE(SUM(cantidad * precio_unitario), 0) FROM orden_items WHERE orden_id = ?)
      WHERE id = ?`,
    [ordenId, ordenId],
  );
}

/**
 * Después de tocar los ítems: recalcula el total y, si el presupuesto estaba
 * enviado y esperando respuesta, lo vuelve a borrador (el cliente vería otro precio).
 * Un presupuesto ya aprobado no se invalida: lo que se agrega durante la reparación
 * queda registrado como parte del trabajo.
 */
async function despuesDeCambiarItems(conn, orden, usuarioId) {
  await recalcularTotal(conn, orden.id);
  if (orden.presupuesto_estado === 'enviado') {
    await conn.query(
      "UPDATE ordenes SET presupuesto_estado = 'borrador', presupuesto_enviado_at = NULL WHERE id = ?",
      [orden.id],
    );
    if (orden.estado === 'esperando_aprobacion') {
      await cambiarEstadoInterno(conn, orden, 'diagnostico', usuarioId, 'Se modificó el presupuesto: hay que reenviarlo.');
    }
  }
}

/** Datos necesarios para armar los mensajes de WhatsApp. */
async function datosParaMensaje(tallerId, id) {
  const [filas] = await pool.query(
    `SELECT o.id, o.numero, o.total, o.token_publico,
            c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
            v.marca, v.modelo, v.patente, v.tipo,
            t.nombre AS taller_nombre,
            EXISTS(SELECT 1 FROM taller_mercadopago mp WHERE mp.taller_id = o.taller_id) AS mp_disponible,
            GREATEST(o.total - COALESCE((SELECT SUM(monto) FROM orden_pagos
               WHERE orden_id = o.id AND anulada_at IS NULL), 0), 0) AS saldo
       FROM ordenes o
       JOIN clientes c ON c.id = o.cliente_id
       JOIN vehiculos v ON v.id = o.vehiculo_id
       JOIN talleres t ON t.id = o.taller_id
      WHERE o.id = ? AND o.taller_id = ?`,
    [id, tallerId],
  );
  const f = filas[0];
  if (!f) throw AppError.noEncontrado('La orden');
  return {
    numero: f.numero,
    total: f.total,
    token_publico: f.token_publico,
    saldo: f.saldo,
    mp_disponible: Boolean(f.mp_disponible),
    cliente: { nombre: f.cliente_nombre, telefono: f.cliente_telefono },
    vehiculo: { marca: f.marca, modelo: f.modelo, patente: f.patente, tipo: f.tipo },
    taller: { nombre: f.taller_nombre },
  };
}

function armarWhatsapp(datos, plantilla) {
  if (!datos.cliente.telefono) return null;
  return whatsapp.linkWhatsapp(datos.cliente.telefono, whatsapp.mensaje(plantilla, datos));
}

// ---------------------------------------------------------------------------
// Casos de uso
// ---------------------------------------------------------------------------

async function crear(auth, datos) {
  const { tallerId, usuarioId } = auth;
  const estadoInicial = datos.estado_inicial ?? 'recibido';

  const id = await withTransaction(async (conn) => {
    let vehiculoId = datos.vehiculo_id;
    let clienteId;

    if (vehiculoId) {
      const vehiculo = await vehiculosService.buscarOFallar(conn, tallerId, vehiculoId);
      clienteId = vehiculo.cliente.id;
    } else {
      ({ vehiculoId, clienteId } = await vehiculosService.crearConConexion(conn, tallerId, datos.vehiculo));
    }

    await validarMecanico(conn, tallerId, datos.mecanico_id);

    // Número correlativo por taller: el FOR UPDATE evita que dos órdenes simultáneas tomen el mismo.
    const [[taller]] = await conn.query('SELECT proximo_numero_orden FROM talleres WHERE id = ? FOR UPDATE', [tallerId]);
    const numero = taller.proximo_numero_orden;
    await conn.query('UPDATE talleres SET proximo_numero_orden = proximo_numero_orden + 1 WHERE id = ?', [tallerId]);

    const [res] = await conn.query(
      `INSERT INTO ordenes (taller_id, numero, vehiculo_id, cliente_id, mecanico_id, motivo, km_ingreso,
                            fecha_estimada_entrega, estado, token_publico)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tallerId, numero, vehiculoId, clienteId, datos.mecanico_id ?? null, datos.motivo, datos.km_ingreso ?? null,
        datos.fecha_estimada_entrega ?? null, estadoInicial, crypto.randomBytes(16).toString('hex'),
      ],
    );

    await actualizarKmVehiculo(conn, vehiculoId, datos.km_ingreso);
    await registrarEvento(conn, res.insertId, usuarioId, 'creada', { hasta: estadoInicial });
    return res.insertId;
  });

  const orden = await obtener(tallerId, id);
  const datosMensaje = await datosParaMensaje(tallerId, id);
  return { ...orden, whatsapp_url: armarWhatsapp(datosMensaje, 'recibido') };
}

async function listar(tallerId, filtros) {
  const { estado, activas, mecanico_id, vehiculo_id, q, desde, hasta, pagina, por_pagina } = filtros;
  const condiciones = ['o.taller_id = ?'];
  const params = [tallerId];

  if (estado) {
    condiciones.push('o.estado IN (?)');
    params.push(estado);
  }
  if (activas === true) {
    condiciones.push('o.estado IN (?)');
    params.push(ESTADOS_ACTIVOS);
  } else if (activas === false) {
    condiciones.push('o.estado IN (?)');
    params.push(ESTADOS_CERRADOS);
  }
  if (mecanico_id) {
    condiciones.push('o.mecanico_id = ?');
    params.push(mecanico_id);
  }
  if (vehiculo_id) {
    condiciones.push('o.vehiculo_id = ?');
    params.push(vehiculo_id);
  }
  if (q) {
    condiciones.push('(v.patente LIKE ? OR c.nombre LIKE ? OR o.numero = ?)');
    params.push(`%${normalizarPatente(q) || q}%`, `%${q}%`, Number(q) || 0);
  }
  if (desde) {
    condiciones.push('o.fecha_ingreso >= ?');
    params.push(`${desde} 00:00:00`);
  }
  if (hasta) {
    condiciones.push('o.fecha_ingreso <= ?');
    params.push(`${hasta} 23:59:59`);
  }

  const from = `FROM ordenes o
    JOIN vehiculos v ON v.id = o.vehiculo_id
    JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN usuarios u ON u.id = o.mecanico_id
   WHERE ${condiciones.join(' AND ')}`;

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, params);
  const [filas] = await pool.query(
    `SELECT o.id, o.numero, o.estado, o.presupuesto_estado, o.motivo, o.total, o.fecha_ingreso,
            o.fecha_estimada_entrega, o.fecha_entrega,
            v.id AS vehiculo_id, v.patente, v.tipo, v.marca, v.modelo,
            c.id AS cliente_id, c.nombre AS cliente_nombre,
            u.id AS mecanico_id, u.nombre AS mecanico_nombre
     ${from}
     ORDER BY o.fecha_ingreso DESC, o.id DESC
     LIMIT ? OFFSET ?`,
    [...params, por_pagina, (pagina - 1) * por_pagina],
  );

  const datos = filas.map((f) => ({
    id: f.id,
    numero: f.numero,
    estado: f.estado,
    estado_etiqueta: ETIQUETAS[f.estado],
    presupuesto_estado: f.presupuesto_estado,
    motivo: f.motivo,
    total: f.total,
    fecha_ingreso: f.fecha_ingreso,
    fecha_estimada_entrega: f.fecha_estimada_entrega,
    fecha_entrega: f.fecha_entrega,
    vehiculo: { id: f.vehiculo_id, patente: f.patente, tipo: f.tipo, marca: f.marca, modelo: f.modelo },
    cliente: { id: f.cliente_id, nombre: f.cliente_nombre },
    mecanico: f.mecanico_id ? { id: f.mecanico_id, nombre: f.mecanico_nombre } : null,
  }));

  return respuestaPaginada(datos, total, { pagina, por_pagina });
}

/** Detalle completo: lo que necesita la pantalla de la orden. */
async function obtener(tallerId, id) {
  const [filas] = await pool.query(
    `SELECT o.*,
            v.patente, v.tipo, v.marca, v.modelo, v.anio, v.km_actual,
            c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
            u.nombre AS mecanico_nombre,
            t.nombre AS taller_nombre
       FROM ordenes o
       JOIN vehiculos v ON v.id = o.vehiculo_id
       JOIN clientes c ON c.id = o.cliente_id
       JOIN talleres t ON t.id = o.taller_id
       LEFT JOIN usuarios u ON u.id = o.mecanico_id
      WHERE o.id = ? AND o.taller_id = ?`,
    [id, tallerId],
  );
  const o = filas[0];
  if (!o) throw AppError.noEncontrado('La orden');

  const [items] = await pool.query(
    `SELECT id, tipo, descripcion, cantidad, precio_unitario,
            ROUND(cantidad * precio_unitario, 2) AS subtotal
       FROM orden_items WHERE orden_id = ? ORDER BY posicion, id`,
    [id],
  );
  const [pagos] = await pool.query(
    `SELECT p.id, p.monto, p.medio, p.fecha, p.nota,
            p.anulada_at, p.anulada_motivo,
            u.nombre AS usuario_nombre,
            ua.nombre AS anulada_por_nombre
       FROM orden_pagos p
       LEFT JOIN usuarios u  ON u.id  = p.usuario_id
       LEFT JOIN usuarios ua ON ua.id = p.anulada_por
      WHERE p.orden_id = ?
      ORDER BY p.fecha, p.id`,
    [id],
  );
  const pagado = pagos
    .filter((p) => p.anulada_at == null)
    .reduce((acc, p) => acc + Number(p.monto), 0);
  const saldo = saldoDesde(o.total, pagado);
  const [[mpRow]] = await pool.query(
    'SELECT 1 AS existe FROM taller_mercadopago WHERE taller_id = ?',
    [tallerId],
  );
  const mpDisponible = Boolean(mpRow);

  // Links de WhatsApp ya armados: el front los usa como links comunes,
  // que ningún navegador bloquea (a diferencia de abrir una ventana por código).
  const datosMensaje = {
    numero: o.numero,
    total: o.total,
    token_publico: o.token_publico,
    saldo: saldo.toFixed(2),
    mp_disponible: mpDisponible,
    cliente: { nombre: o.cliente_nombre, telefono: o.cliente_telefono },
    vehiculo: { marca: o.marca, modelo: o.modelo, patente: o.patente, tipo: o.tipo },
    taller: { nombre: o.taller_nombre },
  };
  const whatsappLinks = o.cliente_telefono
    ? Object.fromEntries(['recibido', 'presupuesto', 'listo', 'pdf'].map((p) => [p, armarWhatsapp(datosMensaje, p)]))
    : null;
  const [eventos] = await pool.query(
    `SELECT e.id, e.tipo, e.estado_desde, e.estado_hasta, e.detalle, e.created_at,
            u.nombre AS usuario_nombre
       FROM orden_eventos e
       LEFT JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.orden_id = ?
      ORDER BY e.created_at, e.id`,
    [id],
  );

  return {
    id: o.id,
    numero: o.numero,
    estado: o.estado,
    estado_etiqueta: ETIQUETAS[o.estado],
    // El front muestra solo los botones de los estados a los que se puede pasar.
    estados_siguientes: TRANSICIONES[o.estado],
    motivo: o.motivo,
    diagnostico: o.diagnostico,
    km_ingreso: o.km_ingreso,
    total: o.total,
    presupuesto: {
      estado: o.presupuesto_estado,
      enviado_at: o.presupuesto_enviado_at,
      respondido_at: o.presupuesto_respondido_at,
    },
    fecha_ingreso: o.fecha_ingreso,
    fecha_estimada_entrega: o.fecha_estimada_entrega,
    fecha_entrega: o.fecha_entrega,
    link_publico: whatsapp.linkPublico(o.token_publico),
    whatsapp: whatsappLinks,
    vehiculo: {
      id: o.vehiculo_id, patente: o.patente, tipo: o.tipo, marca: o.marca, modelo: o.modelo, anio: o.anio, km_actual: o.km_actual,
    },
    cliente: { id: o.cliente_id, nombre: o.cliente_nombre, telefono: o.cliente_telefono },
    mecanico: o.mecanico_id ? { id: o.mecanico_id, nombre: o.mecanico_nombre } : null,
    items,
    pagado: pagado.toFixed(2),
    saldo: saldo.toFixed(2),
    pagos: pagos.map((p) => ({
      id: p.id,
      monto: p.monto,
      medio: p.medio,
      medio_etiqueta: ETIQUETAS_MEDIO[p.medio] || p.medio,
      fecha: p.fecha,
      nota: p.nota,
      usuario_nombre: p.usuario_nombre,
      anulada_at: p.anulada_at,
      anulada_motivo: p.anulada_motivo,
      anulada_por_nombre: p.anulada_por_nombre,
    })),
    eventos: eventos.map((e) => ({ ...e, usuario_nombre: e.usuario_nombre ?? (e.tipo.startsWith('presupuesto_') ? 'Cliente' : null) })),
  };
}

async function editar(auth, id, datos) {
  const { tallerId } = auth;
  await withTransaction(async (conn) => {
    const orden = await buscarOFallar(conn, tallerId, id, { forUpdate: true });
    exigirAbierta(orden);
    if ('mecanico_id' in datos) await validarMecanico(conn, tallerId, datos.mecanico_id);

    const campos = Object.keys(datos);
    await conn.query(
      `UPDATE ordenes SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...campos.map((c) => datos[c]), id],
    );
    await actualizarKmVehiculo(conn, orden.vehiculo_id, datos.km_ingreso);
  });
  return obtener(tallerId, id);
}

async function cambiarEstado(auth, id, { estado: nuevo, detalle, confirmar_saldo_pendiente }) {
  const { tallerId, usuarioId } = auth;
  let whatsappUrl = null;

  await withTransaction(async (conn) => {
    const orden = await buscarOFallar(conn, tallerId, id, { forUpdate: true });

    if (nuevo === 'esperando_aprobacion') {
      throw AppError.conflicto('TRANSICION_INVALIDA', 'Para pedir aprobación, enviá el presupuesto.');
    }
    if (!puedeTransicionar(orden.estado, nuevo)) {
      throw AppError.conflicto(
        'TRANSICION_INVALIDA',
        `No se puede pasar de "${ETIQUETAS[orden.estado]}" a "${ETIQUETAS[nuevo]}".`,
      );
    }

    // Aprobación telefónica: el cliente avisó por teléfono y el taller arranca.
    if (orden.estado === 'esperando_aprobacion' && nuevo === 'en_reparacion') {
      await conn.query(
        "UPDATE ordenes SET presupuesto_estado = 'aprobado', presupuesto_respondido_at = UTC_TIMESTAMP() WHERE id = ?",
        [id],
      );
      await registrarEvento(conn, id, usuarioId, 'presupuesto_aprobado', { detalle: 'Aprobado por el taller' });
    }
    if (nuevo === 'entregado') {
      // Aviso de saldo: si queda plata por cobrar, el front tiene que confirmar.
      const pagado = await pagadoDeOrden(conn, id);
      const saldo = saldoDesde(orden.total, pagado);
      if (saldo > 0 && !confirmar_saldo_pendiente) {
        throw new AppError(
          409,
          'SALDO_PENDIENTE',
          `Faltan cobrar ${montoLegible(saldo)}. Registrá el pago o confirmá que se entrega con saldo pendiente.`,
          { saldo: saldo.toFixed(2), total: Number(orden.total).toFixed(2), pagado: pagado.toFixed(2) },
        );
      }
      await conn.query('UPDATE ordenes SET fecha_entrega = UTC_TIMESTAMP() WHERE id = ?', [id]);
      if (saldo > 0) {
        await registrarEvento(conn, id, usuarioId, 'nota', {
          detalle: `Se entregó con un saldo pendiente de ${montoLegible(saldo)}.`,
        });
      }
    }

    await cambiarEstadoInterno(conn, orden, nuevo, usuarioId, detalle ?? null);
  });

  if (nuevo === 'listo') {
    whatsappUrl = armarWhatsapp(await datosParaMensaje(tallerId, id), 'listo');
  }
  return { ...(await obtener(tallerId, id)), whatsapp_url: whatsappUrl };
}

async function agregarNota(auth, id, { detalle }) {
  const { tallerId, usuarioId } = auth;
  await buscarOFallar(pool, tallerId, id);
  await registrarEvento(pool, id, usuarioId, 'nota', { detalle });
  return obtener(tallerId, id);
}

// --- Ítems del presupuesto -------------------------------------------------

async function agregarItem(auth, id, item) {
  const { tallerId, usuarioId } = auth;
  await withTransaction(async (conn) => {
    const orden = await buscarOFallar(conn, tallerId, id, { forUpdate: true });
    exigirAbierta(orden);
    await conn.query(
      `INSERT INTO orden_items (orden_id, tipo, descripcion, cantidad, precio_unitario, posicion)
       SELECT ?, ?, ?, ?, ?, COALESCE(MAX(posicion), 0) + 1 FROM orden_items WHERE orden_id = ?`,
      [id, item.tipo, item.descripcion, item.cantidad, item.precio_unitario, id],
    );
    await despuesDeCambiarItems(conn, orden, usuarioId);
  });
  return obtener(tallerId, id);
}

async function itemDeOrden(conn, ordenId, itemId) {
  const [filas] = await conn.query('SELECT id FROM orden_items WHERE id = ? AND orden_id = ?', [itemId, ordenId]);
  if (!filas[0]) throw AppError.noEncontrado('El ítem');
}

async function editarItem(auth, id, itemId, cambios) {
  const { tallerId, usuarioId } = auth;
  await withTransaction(async (conn) => {
    const orden = await buscarOFallar(conn, tallerId, id, { forUpdate: true });
    exigirAbierta(orden);
    await itemDeOrden(conn, id, itemId);
    const campos = Object.keys(cambios);
    await conn.query(
      `UPDATE orden_items SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...campos.map((c) => cambios[c]), itemId],
    );
    await despuesDeCambiarItems(conn, orden, usuarioId);
  });
  return obtener(tallerId, id);
}

async function eliminarItem(auth, id, itemId) {
  const { tallerId, usuarioId } = auth;
  await withTransaction(async (conn) => {
    const orden = await buscarOFallar(conn, tallerId, id, { forUpdate: true });
    exigirAbierta(orden);
    await itemDeOrden(conn, id, itemId);
    await conn.query('DELETE FROM orden_items WHERE id = ?', [itemId]);
    await despuesDeCambiarItems(conn, orden, usuarioId);
  });
  return obtener(tallerId, id);
}

// --- Presupuesto y WhatsApp ------------------------------------------------

async function enviarPresupuesto(auth, id) {
  const { tallerId, usuarioId } = auth;

  await withTransaction(async (conn) => {
    const orden = await buscarOFallar(conn, tallerId, id, { forUpdate: true });
    exigirAbierta(orden);

    if (orden.presupuesto_estado === 'aprobado') {
      throw AppError.conflicto('PRESUPUESTO_BLOQUEADO', 'El presupuesto ya fue aprobado.');
    }
    if (!['recibido', 'diagnostico', 'esperando_aprobacion'].includes(orden.estado)) {
      throw AppError.conflicto('TRANSICION_INVALIDA', 'El presupuesto se envía antes de empezar la reparación.');
    }
    const [[{ cantidad }]] = await conn.query('SELECT COUNT(*) AS cantidad FROM orden_items WHERE orden_id = ?', [id]);
    if (cantidad === 0) {
      throw AppError.conflicto('PRESUPUESTO_VACIO', 'Agregá al menos un repuesto o mano de obra antes de enviarlo.');
    }

    await conn.query(
      "UPDATE ordenes SET presupuesto_estado = 'enviado', presupuesto_enviado_at = UTC_TIMESTAMP() WHERE id = ?",
      [id],
    );
    await registrarEvento(conn, id, usuarioId, 'presupuesto_enviado');
    if (orden.estado !== 'esperando_aprobacion') {
      await cambiarEstadoInterno(conn, orden, 'esperando_aprobacion', usuarioId);
    }
  });

  const datos = await datosParaMensaje(tallerId, id);
  return { ...(await obtener(tallerId, id)), whatsapp_url: armarWhatsapp(datos, 'presupuesto') };
}

async function linkWhatsapp(tallerId, id, plantilla) {
  const datos = await datosParaMensaje(tallerId, id);
  if (!datos.cliente.telefono) {
    throw AppError.conflicto('CLIENTE_SIN_TELEFONO', 'El cliente no tiene un teléfono cargado.');
  }
  return {
    whatsapp_url: armarWhatsapp(datos, plantilla),
    mensaje: whatsapp.mensaje(plantilla, datos),
  };
}

/** El front lo llama cuando el usuario abre el link de WhatsApp, para dejarlo en la bitácora. */
async function registrarAviso(auth, id, plantilla) {
  const { tallerId, usuarioId } = auth;
  await buscarOFallar(pool, tallerId, id);
  await registrarEvento(pool, id, usuarioId, 'aviso_whatsapp', { detalle: plantilla });
}

// --- Pagos -----------------------------------------------------------------

async function registrarPago(auth, id, { monto, medio, fecha, nota }) {
  const { tallerId, usuarioId } = auth;

  await withTransaction(async (conn) => {
    const orden = await buscarOFallar(conn, tallerId, id, { forUpdate: true });
    if (orden.estado === 'cancelada') {
      throw AppError.conflicto('ORDEN_CANCELADA', 'La orden está cancelada: no se pueden registrar cobros.');
    }

    await conn.query(
      `INSERT INTO orden_pagos (taller_id, orden_id, usuario_id, monto, medio, fecha, nota)
       VALUES (?, ?, ?, ?, ?, ${fecha ? '?' : 'UTC_TIMESTAMP()'}, ?)`,
      fecha
        ? [tallerId, id, usuarioId, monto, medio, fecha, nota ?? null]
        : [tallerId, id, usuarioId, monto, medio, nota ?? null],
    );

    const detalle = `${ETIQUETAS_MEDIO[medio]} ${montoLegible(monto)}${nota ? `: ${nota}` : ''}`.slice(0, 500);
    await registrarEvento(conn, id, usuarioId, 'pago_registrado', { detalle });
  });

  return obtener(tallerId, id);
}

/**
 * Registra un pago vinculado a un cobro de Mercado Pago. Se invoca desde el webhook,
 * donde no hay sesión: por eso usuario_id queda NULL. Devuelve el id del orden_pagos
 * creado para que el servicio de MP pueda vincularlo en orden_pagos_mp.
 */
async function registrarPagoDesdeMp(tallerId, ordenId, { monto, mpOrderId }) {
  let pagoId;
  await withTransaction(async (conn) => {
    const orden = await buscarOFallar(conn, tallerId, ordenId, { forUpdate: true });
    if (orden.estado === 'cancelada') {
      throw AppError.conflicto('ORDEN_CANCELADA', 'La orden está cancelada: no se puede acreditar el pago.');
    }
    const [res] = await conn.query(
      `INSERT INTO orden_pagos (taller_id, orden_id, usuario_id, monto, medio, fecha, nota)
       VALUES (?, ?, NULL, ?, 'mercado_pago', UTC_TIMESTAMP(), ?)`,
      [tallerId, ordenId, monto, `Mercado Pago · ref ${mpOrderId}`.slice(0, 500)],
    );
    pagoId = res.insertId;
    const detalle = `Mercado Pago ${montoLegible(monto)} (ref ${mpOrderId})`.slice(0, 500);
    await registrarEvento(conn, ordenId, null, 'pago_registrado', { detalle });
  });
  return pagoId;
}

async function anularPago(auth, id, pagoId, { motivo }) {
  const { tallerId, usuarioId } = auth;

  await withTransaction(async (conn) => {
    await buscarOFallar(conn, tallerId, id);
    const [filas] = await conn.query(
      'SELECT id, monto, medio, anulada_at FROM orden_pagos WHERE id = ? AND orden_id = ? AND taller_id = ? FOR UPDATE',
      [pagoId, id, tallerId],
    );
    const pago = filas[0];
    if (!pago) throw AppError.noEncontrado('El pago');
    if (pago.anulada_at) {
      throw AppError.conflicto('PAGO_YA_ANULADO', 'Ese pago ya estaba anulado.');
    }

    await conn.query(
      'UPDATE orden_pagos SET anulada_at = UTC_TIMESTAMP(), anulada_por = ?, anulada_motivo = ? WHERE id = ?',
      [usuarioId, motivo ?? null, pagoId],
    );

    const detalle = `${ETIQUETAS_MEDIO[pago.medio]} ${montoLegible(pago.monto)}${motivo ? ` (${motivo})` : ''}`.slice(0, 500);
    await registrarEvento(conn, id, usuarioId, 'pago_anulado', { detalle });
  });

  return obtener(tallerId, id);
}

// --- PDF -------------------------------------------------------------------

/**
 * Comprobante no fiscal: devuelve el PDF listo para mandar por WhatsApp.
 * `tipo` fuerza el título (presupuesto/comprobante); si no viene, se decide por el estado.
 */
async function pdf(tallerId, id, tipo) {
  const [filas] = await pool.query(
    `SELECT o.numero, o.motivo, o.diagnostico, o.estado, o.fecha_ingreso,
            c.nombre AS cliente_nombre, c.telefono AS cliente_telefono,
            v.patente, v.tipo AS vehiculo_tipo, v.marca, v.modelo, v.anio, v.km_actual,
            t.nombre AS taller_nombre, t.telefono AS taller_telefono,
            t.direccion AS taller_direccion, t.logo_url AS taller_logo
       FROM ordenes o
       JOIN clientes c ON c.id = o.cliente_id
       JOIN vehiculos v ON v.id = o.vehiculo_id
       JOIN talleres t ON t.id = o.taller_id
      WHERE o.id = ? AND o.taller_id = ?`,
    [id, tallerId],
  );
  const o = filas[0];
  if (!o) throw AppError.noEncontrado('La orden');

  const [items] = await pool.query(
    `SELECT tipo, descripcion, cantidad, precio_unitario
       FROM orden_items WHERE orden_id = ? ORDER BY posicion, id`,
    [id],
  );

  const tipoResuelto = tipo ?? tipoPorEstado(o.estado);
  const buffer = await generarPdf({
    taller: { nombre: o.taller_nombre, telefono: o.taller_telefono, direccion: o.taller_direccion, logo_url: o.taller_logo },
    orden: { numero: o.numero, motivo: o.motivo, diagnostico: o.diagnostico, fecha_ingreso: o.fecha_ingreso },
    cliente: { nombre: o.cliente_nombre, telefono: o.cliente_telefono },
    vehiculo: { patente: o.patente, tipo: o.vehiculo_tipo, marca: o.marca, modelo: o.modelo, anio: o.anio, km_actual: o.km_actual },
    items,
    tipo: tipoResuelto,
  });
  return { buffer, numero: o.numero, tipo: tipoResuelto, patente: o.patente };
}

// --- Tablero ---------------------------------------------------------------

async function tablero(tallerId) {
  const [filas] = await pool.query(
    `SELECT o.id, o.numero, o.estado, o.presupuesto_estado, o.motivo, o.total, o.fecha_ingreso,
            o.fecha_estimada_entrega, o.presupuesto_enviado_at,
            v.patente, v.tipo, v.marca, v.modelo,
            c.nombre AS cliente_nombre,
            u.id AS mecanico_id, u.nombre AS mecanico_nombre
       FROM ordenes o
       JOIN vehiculos v ON v.id = o.vehiculo_id
       JOIN clientes c ON c.id = o.cliente_id
       LEFT JOIN usuarios u ON u.id = o.mecanico_id
      WHERE o.taller_id = ? AND o.estado IN (?)
      ORDER BY o.fecha_ingreso`,
    [tallerId, ESTADOS_ACTIVOS],
  );

  const columnas = Object.fromEntries(ESTADOS_ACTIVOS.map((e) => [e, []]));
  for (const f of filas) {
    columnas[f.estado].push({
      id: f.id,
      numero: f.numero,
      patente: f.patente,
      tipo: f.tipo,
      vehiculo: [f.marca, f.modelo].filter(Boolean).join(' ') || null,
      cliente: f.cliente_nombre,
      motivo: f.motivo,
      total: f.total,
      mecanico: f.mecanico_id ? { id: f.mecanico_id, nombre: f.mecanico_nombre } : null,
      fecha_ingreso: f.fecha_ingreso,
      fecha_estimada_entrega: f.fecha_estimada_entrega,
      presupuesto_enviado_at: f.presupuesto_enviado_at,
    });
  }

  const [[{ entregados_hoy }]] = await pool.query(
    `SELECT COUNT(*) AS entregados_hoy FROM ordenes
      WHERE taller_id = ? AND estado = 'entregado'
        -- "hoy" en hora argentina (UTC-3, sin horario de verano)
        AND fecha_entrega >= DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR) + INTERVAL 3 HOUR`,
    [tallerId],
  );

  return {
    resumen: {
      en_taller: filas.length,
      listos: columnas.listo.length,
      presupuestos_sin_respuesta: columnas.esperando_aprobacion.length,
      entregados_hoy,
    },
    columnas,
  };
}

module.exports = {
  crear, listar, obtener, editar, cambiarEstado, agregarNota,
  agregarItem, editarItem, eliminarItem,
  enviarPresupuesto, linkWhatsapp, registrarAviso, pdf, tablero,
  registrarPago, anularPago, registrarPagoDesdeMp,
};

const env = require('../../config/env');
const { pool } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const orders = require('./orders');

/**
 * Pagos online: iniciar el cobro de una orden del taller con la cuenta
 * de Mercado Pago del taller. No toca orden_pagos todavía: solo prepara
 * la orden MP y guarda el vínculo. El registro definitivo en orden_pagos
 * lo hace el webhook cuando confirma el pago.
 */

/** Ventana para reusar un intento previo si el monto sigue siendo el mismo. */
const REUSAR_MINUTOS = 30;

/** Si ya hubo un intento reciente, no gastamos otra orden en MP: reusamos su checkout_url. */
async function intentoReusable(ordenId, monto) {
  const [filas] = await pool.query(
    `SELECT id, mp_order_id, checkout_url, monto
       FROM orden_pagos_mp
      WHERE orden_id = ?
        AND estado = 'created'
        AND pago_id IS NULL
        AND checkout_url IS NOT NULL
        AND created_at > NOW() - INTERVAL ? MINUTE
      ORDER BY created_at DESC
      LIMIT 1`,
    [ordenId, REUSAR_MINUTOS],
  );
  const fila = filas[0];
  if (!fila) return null;
  // Mismo monto, mismo link. Si el saldo cambió (nuevo pago en efectivo, nuevo ítem), creamos otro.
  if (Number(fila.monto) !== Number(monto)) return null;
  return fila;
}

async function tokenDeTaller(tallerId) {
  const [filas] = await pool.query(
    'SELECT access_token FROM taller_mercadopago WHERE taller_id = ?',
    [tallerId],
  );
  return filas[0]?.access_token || null;
}

async function saldoDeOrden(ordenId) {
  const [[fila]] = await pool.query(
    `SELECT o.total,
            COALESCE((SELECT SUM(monto) FROM orden_pagos
                       WHERE orden_id = o.id AND anulada_at IS NULL), 0) AS pagado
       FROM ordenes o
      WHERE o.id = ?`,
    [ordenId],
  );
  const total = Number(fila.total);
  const pagado = Number(fila.pagado);
  const saldo = Math.round((total - pagado) * 100) / 100;
  return { total, pagado, saldo };
}

/**
 * Trae la orden a partir del token público. Devuelve lo mínimo necesario
 * para armar el pago. Si el token no existe, lanza 404.
 */
async function ordenPorToken(token) {
  const [filas] = await pool.query(
    `SELECT o.id, o.taller_id, o.numero, o.estado, o.total,
            v.patente, v.marca, v.modelo
       FROM ordenes o
       JOIN vehiculos v ON v.id = o.vehiculo_id
      WHERE o.token_publico = ?`,
    [token],
  );
  if (!filas[0]) throw AppError.noEncontrado('La orden');
  return filas[0];
}

/**
 * Devuelve lo necesario para redirigir al cliente al checkout.
 * Si no hay nada que cobrar o la cuenta MP no está conectada, lanza
 * AppError de conflicto con un código estable para que la ruta
 * decida a dónde redirigir.
 */
async function iniciarPago(token) {
  const orden = await ordenPorToken(token);

  if (orden.estado === 'cancelada') {
    throw AppError.conflicto('ORDEN_CANCELADA', 'La orden está cancelada.');
  }

  const { saldo } = await saldoDeOrden(orden.id);
  if (saldo <= 0) {
    throw AppError.conflicto('YA_PAGADA', 'No queda saldo por pagar.');
  }

  const accessToken = await tokenDeTaller(orden.taller_id);
  if (!accessToken) {
    throw AppError.conflicto('MP_NO_CONECTADO', 'El taller todavía no conectó Mercado Pago.');
  }

  // Si el cliente ya había abierto el link hace poco con el mismo monto, reusamos.
  const reusable = await intentoReusable(orden.id, saldo);
  if (reusable) return { checkout_url: reusable.checkout_url, reusado: true };

  const externalReference = `t${orden.taller_id}-o${orden.id}`;
  const descripcion = `Trabajos — Orden ${orden.numero}${orden.patente ? `, ${orden.patente}` : ''}`;

  const base = env.PUBLIC_APP_URL.replace(/\/$/, '');
  // El webhook necesita el taller_id para pedir el detalle del pago con el token correcto.
  // Lo pasamos en el query de la URL de notificación (cada preferencia tiene la suya).
  const notificationUrl = `${base}/api/publico/mp/webhook?taller=${orden.taller_id}`;
  const backUrls = {
    success: `${base}/o/${token}?pago=ok`,
    failure: `${base}/o/${token}?pago=rechazado`,
    pending: `${base}/o/${token}?pago=pendiente`,
  };

  const respuesta = await orders.crearPreferencia({
    accessToken,
    monto: saldo,
    externalReference,
    descripcion,
    notificationUrl,
    backUrls,
  });

  const preferenceId = respuesta.id;
  const checkoutUrl = respuesta.init_point || respuesta.sandbox_init_point || null;
  if (!preferenceId || !checkoutUrl) {
    const err = new Error('Mercado Pago no devolvió init_point. Revisá el panel de MP o la configuración de la app.');
    err.mpBody = respuesta;
    throw err;
  }

  // Reusamos la columna mp_order_id para guardar el preference_id (no hace falta migración).
  await pool.query(
    `INSERT INTO orden_pagos_mp (taller_id, orden_id, mp_order_id, external_reference, monto, checkout_url, estado)
     VALUES (?, ?, ?, ?, ?, ?, 'created')`,
    [orden.taller_id, orden.id, String(preferenceId), externalReference, saldo, checkoutUrl],
  );

  return { checkout_url: checkoutUrl, reusado: false };
}

module.exports = { iniciarPago, saldoDeOrden, ordenPorToken, tokenDeTaller };

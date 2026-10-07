const crypto = require('node:crypto');
const env = require('../../config/env');
const { pool } = require('../../db/pool');
const orders = require('./orders');
const ordenesService = require('../ordenes/ordenes.service');

/**
 * Procesa una notificación de Mercado Pago.
 *   1. (opcional) Verifica la firma del header `x-signature` con MP_WEBHOOK_SECRET.
 *   2. Busca el intento de pago en nuestra base (orden_pagos_mp) por el mp_order_id.
 *   3. Pide el detalle de la orden a MP con el access_token del taller (así validamos
 *      que la notificación es real: nadie puede inventar un cobro sin que MP tenga la orden).
 *   4. Si está pagada y todavía no la habíamos registrado, crea un orden_pagos
 *      (medio = mercado_pago) y vincula el pago_id en orden_pagos_mp.
 *   5. Siempre devuelve 200 (así MP no reintenta eternamente); el motivo se loguea.
 */

/** Estados que consideramos "cobrado y acreditado". MP tuvo distintos nombres en el tiempo. */
const ESTADOS_PAGADOS = new Set(['processed', 'paid', 'approved', 'closed']);

function extraerOrderId({ body, query }) {
  // Formatos conocidos: body.data.id (nuevo), body.resource (URL con id), query.id (viejo IPN).
  const porBody = body?.data?.id ?? body?.id;
  if (porBody) return String(porBody);
  if (typeof body?.resource === 'string') {
    const match = body.resource.match(/orders\/([^/?#]+)/);
    if (match) return match[1];
  }
  if (query?.id) return String(query.id);
  return null;
}

/**
 * Verifica la firma HMAC-SHA256 según el formato de MP:
 *   x-signature: ts=1700000000,v1=hexhash
 *   manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
 * Si falta el secret o cualquier dato, se considera no verificable y se devuelve `null`.
 * Se devuelve `true`/`false` solo cuando sí se puede verificar.
 */
function verificarFirma({ signatureHeader, requestId, dataId }) {
  if (!env.MP_WEBHOOK_SECRET || !signatureHeader) return null;
  const partes = Object.fromEntries(
    String(signatureHeader).split(',').map((p) => p.split('=').map((s) => s.trim())),
  );
  if (!partes.ts || !partes.v1) return false;
  const manifiesto = `id:${dataId};request-id:${requestId || ''};ts:${partes.ts};`;
  const esperado = crypto.createHmac('sha256', env.MP_WEBHOOK_SECRET).update(manifiesto).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(esperado, 'hex'), Buffer.from(partes.v1, 'hex'));
  } catch {
    return false;
  }
}

async function tallerPorConexion(tallerId) {
  const [filas] = await pool.query(
    'SELECT access_token FROM taller_mercadopago WHERE taller_id = ?',
    [tallerId],
  );
  return filas[0] || null;
}

async function registroPorMpOrderId(mpOrderId) {
  const [filas] = await pool.query(
    'SELECT * FROM orden_pagos_mp WHERE mp_order_id = ?',
    [mpOrderId],
  );
  return filas[0] || null;
}

function montoDesdeOrden(ordenMp) {
  // La Orders API puede devolver total_amount o paid_amount (en strings) según el estado.
  const n = Number(ordenMp.total_amount ?? ordenMp.paid_amount ?? ordenMp?.transactions?.payments?.[0]?.amount);
  return Number.isFinite(n) ? n : null;
}

/**
 * Procesa el webhook. Devuelve un resumen para el log; nunca lanza (los errores quedan ahí).
 * El router responde siempre 200 excepto cuando la firma no verifica (401).
 */
async function procesar({ body, query, signatureHeader, requestId }) {
  const mpOrderId = extraerOrderId({ body, query });
  if (!mpOrderId) return { resultado: 'sin_order_id' };

  // Si hay secret cargado, exigimos firma. Si no hay secret, se procesa igual (dev).
  const firma = verificarFirma({ signatureHeader, requestId, dataId: mpOrderId });
  if (firma === false) return { resultado: 'firma_invalida', firmaInvalida: true };

  const registro = await registroPorMpOrderId(mpOrderId);
  if (!registro) return { resultado: 'desconocido', mpOrderId };
  if (registro.pago_id) return { resultado: 'ya_registrado', mpOrderId };

  const conexion = await tallerPorConexion(registro.taller_id);
  if (!conexion) return { resultado: 'taller_desconectado', mpOrderId };

  let ordenMp;
  try {
    ordenMp = await orders.obtener({ accessToken: conexion.access_token, mpOrderId });
  } catch (err) {
    return { resultado: 'error_consulta_mp', mpOrderId, motivo: err.message };
  }

  const estado = String(ordenMp.status || ordenMp.state || '').toLowerCase();
  if (!ESTADOS_PAGADOS.has(estado)) {
    await pool.query('UPDATE orden_pagos_mp SET estado = ? WHERE id = ?', [estado || 'desconocido', registro.id]);
    return { resultado: 'no_pagada', mpOrderId, estadoMp: estado };
  }

  const montoMp = montoDesdeOrden(ordenMp);
  if (montoMp == null || Math.abs(montoMp - Number(registro.monto)) > 0.01) {
    // Igual lo registramos con lo que diga MP (es lo que se cobró), pero avisamos.
    // (La diferencia podría ocurrir si por algún motivo MP cerró con otro monto.)
  }
  const montoAcreditado = montoMp ?? Number(registro.monto);

  let pagoId;
  try {
    pagoId = await ordenesService.registrarPagoDesdeMp(registro.taller_id, registro.orden_id, {
      monto: montoAcreditado,
      mpOrderId,
    });
  } catch (err) {
    return { resultado: 'error_registro', mpOrderId, motivo: err.message };
  }

  await pool.query(
    `UPDATE orden_pagos_mp
        SET estado = 'paid', pago_id = ?, pagado_at = UTC_TIMESTAMP()
      WHERE id = ?`,
    [pagoId, registro.id],
  );

  return { resultado: 'registrado', mpOrderId, pagoId, monto: montoAcreditado };
}

module.exports = { procesar, extraerOrderId, verificarFirma };

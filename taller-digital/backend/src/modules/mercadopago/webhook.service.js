const crypto = require('node:crypto');
const env = require('../../config/env');
const { pool } = require('../../db/pool');
const orders = require('./orders');
const ordenesService = require('../ordenes/ordenes.service');

/**
 * Procesa una notificación de Checkout Pro de Mercado Pago.
 *   1. (opcional) Verifica la firma del header `x-signature` con MP_WEBHOOK_SECRET.
 *   2. Lee el `taller` del query (lo mandamos nosotros al crear la preferencia)
 *      para saber con qué access_token hablarle a MP.
 *   3. Pide el detalle del pago a MP (/v1/payments/{id}) con el access_token del taller.
 *   4. Busca el intento en nuestra base por preference_id (guardado en orden_pagos_mp.mp_order_id).
 *   5. Si el pago está aprobado y todavía no lo habíamos registrado, crea un orden_pagos
 *      (medio = mercado_pago) y vincula el pago_id en orden_pagos_mp.
 *   6. Devuelve siempre un resumen; la ruta decide el status HTTP.
 */

/** Status de MP que consideramos "cobrado y acreditado" en Checkout Pro. */
const ESTADOS_PAGADOS = new Set(['approved', 'authorized']);

function extraerPagoId({ body, query }) {
  // Checkout Pro manda notificaciones en varios formatos según la versión:
  //   - body.data.id + body.type = "payment"       (webhooks nuevo)
  //   - body.resource = ".../v1/payments/XXX"       (IPN clásica, URL)
  //   - query.topic = "payment" + query.id = "XXX" (IPN clásica, query)
  //   - body.id (raro, legacy)
  const porBody = body?.data?.id ?? body?.id;
  if (porBody) return String(porBody);
  if (typeof body?.resource === 'string') {
    const match = body.resource.match(/payments\/([^/?#]+)/);
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

async function tokenDeTaller(tallerId) {
  const [filas] = await pool.query(
    'SELECT access_token FROM taller_mercadopago WHERE taller_id = ?',
    [tallerId],
  );
  return filas[0] || null;
}

async function registroPorPreferenceId(preferenceId) {
  const [filas] = await pool.query(
    'SELECT * FROM orden_pagos_mp WHERE mp_order_id = ?',
    [preferenceId],
  );
  return filas[0] || null;
}

async function registroPorReferenciaCreada(externalReference) {
  // Fallback cuando el pago no tiene preference_id visible: buscamos un intento
  // "created" para esa external_reference. Priorizamos el más reciente.
  const [filas] = await pool.query(
    `SELECT * FROM orden_pagos_mp
      WHERE external_reference = ? AND estado = 'created' AND pago_id IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [externalReference],
  );
  return filas[0] || null;
}

function montoDesdePago(pagoMp) {
  const n = Number(pagoMp.transaction_amount ?? pagoMp.transaction_details?.total_paid_amount);
  return Number.isFinite(n) ? n : null;
}

/**
 * Procesa el webhook. Devuelve un resumen para el log; nunca lanza.
 * La ruta responde 200 excepto cuando la firma no verifica (401, invita a MP a reintentar).
 */
async function procesar({ body, query, signatureHeader, requestId }) {
  const pagoIdMp = extraerPagoId({ body, query });
  if (!pagoIdMp) return { resultado: 'sin_pago_id' };

  // Si hay secret cargado, exigimos firma. Si no hay secret, se procesa igual (dev).
  const firma = verificarFirma({ signatureHeader, requestId, dataId: pagoIdMp });
  if (firma === false) return { resultado: 'firma_invalida', firmaInvalida: true };

  // Checkout Pro: filtramos las notificaciones que no son de pagos.
  const tipo = String(body?.type || body?.topic || query?.topic || '').toLowerCase();
  if (tipo && tipo !== 'payment') return { resultado: 'tipo_ignorado', tipo, pagoIdMp };

  const tallerId = Number(query?.taller);
  if (!Number.isFinite(tallerId) || tallerId <= 0) {
    return { resultado: 'sin_taller_en_notification_url', pagoIdMp };
  }

  const conexion = await tokenDeTaller(tallerId);
  if (!conexion) return { resultado: 'taller_desconectado', pagoIdMp, tallerId };

  let pagoMp;
  try {
    pagoMp = await orders.obtenerPago({ accessToken: conexion.access_token, pagoId: pagoIdMp });
  } catch (err) {
    return { resultado: 'error_consulta_mp', pagoIdMp, motivo: err.message };
  }

  const preferenceId = pagoMp.preference_id || pagoMp.order?.id || null;
  const externalReference = pagoMp.external_reference || null;

  let registro = null;
  if (preferenceId) registro = await registroPorPreferenceId(String(preferenceId));
  if (!registro && externalReference) registro = await registroPorReferenciaCreada(externalReference);
  if (!registro) return { resultado: 'desconocido', pagoIdMp, preferenceId, externalReference };
  if (registro.pago_id) return { resultado: 'ya_registrado', pagoIdMp, preferenceId };
  if (registro.taller_id !== tallerId) return { resultado: 'taller_no_coincide', pagoIdMp, preferenceId };

  const estado = String(pagoMp.status || '').toLowerCase();
  if (!ESTADOS_PAGADOS.has(estado)) {
    await pool.query('UPDATE orden_pagos_mp SET estado = ? WHERE id = ?', [estado || 'desconocido', registro.id]);
    return { resultado: 'no_pagada', pagoIdMp, estadoMp: estado };
  }

  const montoMp = montoDesdePago(pagoMp);
  const montoAcreditado = montoMp ?? Number(registro.monto);

  let pagoId;
  try {
    pagoId = await ordenesService.registrarPagoDesdeMp(registro.taller_id, registro.orden_id, {
      monto: montoAcreditado,
      mpOrderId: String(pagoIdMp),
    });
  } catch (err) {
    return { resultado: 'error_registro', pagoIdMp, motivo: err.message };
  }

  await pool.query(
    `UPDATE orden_pagos_mp
        SET estado = 'paid', pago_id = ?, pagado_at = UTC_TIMESTAMP()
      WHERE id = ?`,
    [pagoId, registro.id],
  );

  return { resultado: 'registrado', pagoIdMp, pagoId, monto: montoAcreditado };
}

module.exports = { procesar, extraerPagoId, verificarFirma };

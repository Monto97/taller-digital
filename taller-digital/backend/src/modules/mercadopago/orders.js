/**
 * Wrapper fino sobre Checkout Pro (preferences) y Payments de Mercado Pago.
 *   - crearPreferencia: POST /checkout/preferences con el access_token del taller.
 *     Devuelve init_point (URL del checkout hosteado) y id (preference_id).
 *   - obtenerPago: GET /v1/payments/{id} con el access_token del taller.
 *     Lo usa el webhook para verificar el pago.
 *   - buscarPagosPorReferencia: GET /v1/payments/search?external_reference=...
 *     Útil para reconciliar si se perdió una notificación.
 */
const crypto = require('node:crypto');

const BASE_URL = 'https://api.mercadopago.com';

async function pedir(url, { accessToken, method = 'GET', body, idempotencyKey } = {}) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;

  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const texto = await res.text();
  let json;
  try { json = JSON.parse(texto); } catch { json = { raw: texto }; }

  if (!res.ok) {
    const motivo = json?.message || json?.error || json?.cause?.[0]?.description || `HTTP ${res.status}`;
    const err = new Error(`Mercado Pago rechazó la operación: ${motivo}`);
    err.mpStatus = res.status;
    err.mpBody = json;
    throw err;
  }
  return json;
}

/**
 * Crea una preferencia de Checkout Pro y devuelve la respuesta cruda.
 * Nos interesa: id (preference_id), init_point (URL del checkout).
 */
async function crearPreferencia({ accessToken, monto, externalReference, descripcion, notificationUrl, backUrls }) {
  const body = {
    items: [
      {
        title: descripcion,
        quantity: 1,
        unit_price: Number(Number(monto).toFixed(2)),
        currency_id: 'ARS',
      },
    ],
    external_reference: externalReference,
    binary_mode: false,
  };
  if (notificationUrl) body.notification_url = notificationUrl;
  if (backUrls) {
    body.back_urls = backUrls;
    body.auto_return = 'approved';
  }
  return pedir(`${BASE_URL}/checkout/preferences`, {
    accessToken,
    method: 'POST',
    body,
    idempotencyKey: crypto.randomUUID(),
  });
}

/** Trae el detalle de un pago. Lo usa el webhook para validar status y external_reference. */
function obtenerPago({ accessToken, pagoId }) {
  return pedir(`${BASE_URL}/v1/payments/${encodeURIComponent(pagoId)}`, { accessToken });
}

/**
 * Busca pagos por external_reference. Devuelve lo que MP tenga en su base.
 * Útil cuando perdimos una notificación y queremos verificar si una orden se pagó.
 */
function buscarPagosPorReferencia({ accessToken, externalReference }) {
  const url = `${BASE_URL}/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}`;
  return pedir(url, { accessToken });
}

module.exports = { crearPreferencia, obtenerPago, buscarPagosPorReferencia };

/**
 * Wrapper fino sobre la Orders API de Mercado Pago.
 *   - crear: POST /v1/orders con el access_token del taller y un X-Idempotency-Key.
 *   - buscarPorReferencia: GET /v1/orders/search?external_reference=... (para verificar manualmente).
 *
 * La forma exacta del body de la Orders API puede cambiar según el país y
 * la fecha; si MP devuelve 400 por un campo, se ajusta acá sin tocar el service.
 * Doc: https://www.mercadopago.com.ar/developers/es/reference/orders/_orders/post
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
 * Crea una orden "online" (checkout hosteado) y devuelve la respuesta cruda.
 * Nos interesa: id, status, checkout_url, external_reference.
 */
async function crear({ accessToken, monto, externalReference, descripcion }) {
  const body = {
    type: 'online',
    external_reference: externalReference,
    total_amount: Number(monto).toFixed(2),
    processing_mode: 'automatic',
    description: descripcion,
    transactions: {
      payments: [{ amount: Number(monto).toFixed(2) }],
    },
  };
  return pedir(`${BASE_URL}/v1/orders`, {
    accessToken,
    method: 'POST',
    body,
    idempotencyKey: crypto.randomUUID(),
  });
}

/** Devuelve el detalle de una orden ya creada (lo usa el webhook para verificar). */
function obtener({ accessToken, mpOrderId }) {
  return pedir(`${BASE_URL}/v1/orders/${encodeURIComponent(mpOrderId)}`, { accessToken });
}

/**
 * Busca por external_reference. Devuelve lo que MP tenga en su base.
 * Útil cuando perdimos una notificación y queremos verificar si una orden se pagó.
 */
function buscarPorReferencia({ accessToken, externalReference }) {
  const url = `${BASE_URL}/v1/orders/search?external_reference=${encodeURIComponent(externalReference)}`;
  return pedir(url, { accessToken });
}

module.exports = { crear, obtener, buscarPorReferencia };

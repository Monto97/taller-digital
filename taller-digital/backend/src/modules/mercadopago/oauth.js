/**
 * Capa fina sobre los endpoints de OAuth de Mercado Pago.
 * Un wrapper acá en vez de tocar fetch desde el service hace más fácil mockearlo en tests.
 */
const env = require('../../config/env');

const AUTH_URL = 'https://auth.mercadopago.com.ar/authorization';
const TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

/** Arma la URL de autorización. `state` lo firma el service. */
function urlAutorizacion(state) {
  const params = new URLSearchParams({
    client_id: env.MP_CLIENT_ID,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: env.MP_REDIRECT_URI,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function pedirToken(cuerpo) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.MP_CLIENT_ID,
      client_secret: env.MP_CLIENT_SECRET,
      ...cuerpo,
    }),
  });
  const texto = await res.text();
  let json;
  try { json = JSON.parse(texto); } catch { json = { raw: texto }; }
  if (!res.ok) {
    const motivo = json?.error_description || json?.message || json?.error || `HTTP ${res.status}`;
    const err = new Error(`Mercado Pago rechazó la operación: ${motivo}`);
    err.mpStatus = res.status;
    err.mpBody = json;
    throw err;
  }
  return json;
}

/** Intercambia el `code` del callback por un token de larga duración. */
function intercambiarCode(code) {
  return pedirToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.MP_REDIRECT_URI,
  });
}

function refrescarToken(refreshToken) {
  return pedirToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

module.exports = { urlAutorizacion, intercambiarCode, refrescarToken };

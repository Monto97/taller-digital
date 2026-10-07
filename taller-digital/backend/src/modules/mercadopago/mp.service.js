const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { pool } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const oauth = require('./oauth');

/** Para el front: avisa si falta configurar las credenciales de la app en el servidor. */
function configurado() {
  return Boolean(env.MP_CLIENT_ID && env.MP_CLIENT_SECRET);
}

function exigirConfigurado() {
  if (!configurado()) {
    throw AppError.conflicto(
      'MP_NO_CONFIGURADO',
      'Mercado Pago todavía no está configurado en el servidor. Pedile al admin que cargue las credenciales.',
    );
  }
}

/**
 * El `state` que mandamos a MP vuelve tal cual. Lo firmamos con JWT (TTL corto):
 * así en el callback sabemos qué taller inició la conexión sin confiar en cookies
 * ni en nada del query, y nadie puede forjarlo sin el secret.
 */
function firmarState({ tallerId, usuarioId }) {
  return jwt.sign({ tid: tallerId, uid: usuarioId, p: 'mp-oauth' }, env.JWT_SECRET, { expiresIn: '10m' });
}

function verificarState(state) {
  try {
    const payload = jwt.verify(state, env.JWT_SECRET);
    if (payload.p !== 'mp-oauth') throw new Error('propósito inválido');
    return { tallerId: Number(payload.tid), usuarioId: Number(payload.uid) };
  } catch {
    throw AppError.conflicto('STATE_INVALIDO', 'El pedido de conexión caducó o no es válido. Volvé a conectar la cuenta.');
  }
}

async function urlAutorizacion(auth) {
  exigirConfigurado();
  const state = firmarState({ tallerId: auth.tallerId, usuarioId: auth.usuarioId });
  return { url: oauth.urlAutorizacion(state) };
}

async function procesarCallback({ code, state, error, error_description }) {
  // En el callback nunca tiramos excepción: siempre devolvemos un resultado para que la ruta pueda
  // redirigir al front con un aviso legible. Las validaciones que harían un 409 en otras rutas
  // acá viajan como { ok: false, motivo }.
  if (error) {
    return { ok: false, motivo: error_description || error };
  }
  if (!code || !state) {
    return { ok: false, motivo: 'faltan parámetros' };
  }
  if (!configurado()) {
    return { ok: false, motivo: 'Mercado Pago no está configurado en el servidor.' };
  }

  let tallerId;
  try {
    ({ tallerId } = verificarState(state));
  } catch (err) {
    return { ok: false, motivo: err.message || 'state inválido' };
  }

  let token;
  try {
    token = await oauth.intercambiarCode(code);
  } catch (err) {
    return { ok: false, motivo: err.message };
  }

  const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null;
  await pool.query(
    `INSERT INTO taller_mercadopago (taller_id, mp_user_id, access_token, refresh_token, public_key, live_mode, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       mp_user_id    = VALUES(mp_user_id),
       access_token  = VALUES(access_token),
       refresh_token = VALUES(refresh_token),
       public_key    = VALUES(public_key),
       live_mode     = VALUES(live_mode),
       expires_at    = VALUES(expires_at)`,
    [
      tallerId,
      String(token.user_id ?? ''),
      token.access_token,
      token.refresh_token ?? null,
      token.public_key ?? null,
      token.live_mode === false ? 0 : 1,
      expiresAt,
    ],
  );

  return { ok: true, tallerId };
}

async function estado(tallerId) {
  if (!configurado()) {
    return { configurado: false, conectado: false };
  }
  const [filas] = await pool.query(
    'SELECT mp_user_id, live_mode, conectado_at, expires_at FROM taller_mercadopago WHERE taller_id = ?',
    [tallerId],
  );
  const fila = filas[0];
  if (!fila) return { configurado: true, conectado: false };
  return {
    configurado: true,
    conectado: true,
    mp_user_id: fila.mp_user_id,
    live_mode: !!fila.live_mode,
    conectado_at: fila.conectado_at,
    expires_at: fila.expires_at,
  };
}

async function desconectar(tallerId) {
  const [res] = await pool.query('DELETE FROM taller_mercadopago WHERE taller_id = ?', [tallerId]);
  return { desconectado: res.affectedRows > 0 };
}

module.exports = {
  configurado,
  firmarState,
  verificarState,
  urlAutorizacion,
  procesarCallback,
  estado,
  desconectar,
};

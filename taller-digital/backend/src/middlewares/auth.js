const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');

function firmarToken(usuario) {
  return jwt.sign(
    { sub: String(usuario.id), taller_id: usuario.taller_id, rol: usuario.rol },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );
}

/**
 * Exige un JWT válido y deja en req.auth el contexto del usuario:
 *   { usuarioId, tallerId, rol }
 * tallerId es la ÚNICA fuente de verdad del tenant: nunca se toma de la URL ni del body.
 *
 * Además confirma en la base que el usuario y su taller sigan habilitados, así
 * deshabilitar un taller desde el panel de admin corta las sesiones abiertas al instante.
 */
async function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const [tipo, token] = header.split(' ');
  if (tipo !== 'Bearer' || !token) return next(AppError.noAutenticado());

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    return next(AppError.noAutenticado('La sesión expiró o no es válida.'));
  }

  try {
    const { pool } = require('../db/pool');
    const [filas] = await pool.query(
      `SELECT 1 FROM usuarios u JOIN talleres t ON t.id = u.taller_id
        WHERE u.id = ? AND u.taller_id = ? AND u.activo = 1 AND t.activo = 1`,
      [Number(payload.sub), Number(payload.taller_id)],
    );
    if (!filas[0]) return next(AppError.noAutenticado('La cuenta está desactivada.'));
  } catch (err) {
    return next(err);
  }

  req.auth = {
    usuarioId: Number(payload.sub),
    tallerId: Number(payload.taller_id),
    rol: payload.rol,
  };
  return next();
}

function esAdmin(email) {
  return env.ADMIN_EMAILS.includes(String(email).toLowerCase());
}

/**
 * Solo para el panel de admin. Se chequea el email contra ADMIN_EMAILS en cada
 * request (no se confía en el token), así sacar a alguien de la lista corta el acceso al instante.
 */
async function requireAdmin(req, _res, next) {
  try {
    const { pool } = require('../db/pool');
    const [filas] = await pool.query('SELECT email FROM usuarios WHERE id = ? AND activo = 1', [req.auth?.usuarioId]);
    if (!filas[0] || !esAdmin(filas[0].email)) return next(AppError.sinPermiso());
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Uso: router.post('/usuarios', requireRol('dueno'), handler) */
function requireRol(...roles) {
  return (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.rol)) return next(AppError.sinPermiso());
    return next();
  };
}

module.exports = { firmarToken, requireAuth, requireRol, requireAdmin, esAdmin };

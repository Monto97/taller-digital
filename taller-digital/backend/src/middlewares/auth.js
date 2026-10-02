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
 */
function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const [tipo, token] = header.split(' ');
  if (tipo !== 'Bearer' || !token) return next(AppError.noAutenticado());

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.auth = {
      usuarioId: Number(payload.sub),
      tallerId: Number(payload.taller_id),
      rol: payload.rol,
    };
    return next();
  } catch {
    return next(AppError.noAutenticado('La sesión expiró o no es válida.'));
  }
}

/** Uso: router.post('/usuarios', requireRol('dueno'), handler) */
function requireRol(...roles) {
  return (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.rol)) return next(AppError.sinPermiso());
    return next();
  };
}

module.exports = { firmarToken, requireAuth, requireRol };

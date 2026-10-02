const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const validate = require('../../middlewares/validate');
const crypto = require('node:crypto');
const { requireAuth } = require('../../middlewares/auth');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const schemas = require('./auth.schemas');
const service = require('./auth.service');

const router = Router();

// Frena intentos de fuerza bruta sobre login y registro.
const limitadorAuth = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (_req, res) => res.status(429).json({
    error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos. Probá de nuevo en un minuto.' },
  }),
});

/**
 * El alta de talleres la hacés vos, no cualquiera desde internet:
 * - Con REGISTRO_CLAVE definida, hay que mandar el header X-Clave-Registro.
 * - En producción sin REGISTRO_CLAVE, el registro está cerrado (se usa scripts/crear-taller.js).
 * - En desarrollo y test sin clave, queda abierto para probar cómodo.
 */
function controlRegistro(req, _res, next) {
  if (env.REGISTRO_CLAVE) {
    const recibida = Buffer.from(req.get('x-clave-registro') || '');
    const esperada = Buffer.from(env.REGISTRO_CLAVE);
    const ok = recibida.length === esperada.length && crypto.timingSafeEqual(recibida, esperada);
    return ok ? next() : next(new AppError(403, 'REGISTRO_CERRADO', 'El registro de talleres no está habilitado.'));
  }
  if (env.NODE_ENV === 'production') {
    return next(new AppError(403, 'REGISTRO_CERRADO', 'El registro de talleres no está habilitado.'));
  }
  return next();
}

router.post('/registro', limitadorAuth, controlRegistro, validate({ body: schemas.registro }), async (req, res) => {
  res.status(201).json(await service.registro(req.datos.body));
});

router.post('/login', limitadorAuth, validate({ body: schemas.login }), async (req, res) => {
  res.json(await service.login(req.datos.body));
});

router.get('/me', requireAuth, async (req, res) => {
  res.json(await service.me(req.auth));
});

module.exports = router;

const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const validate = require('../../middlewares/validate');
const { requireAuth } = require('../../middlewares/auth');
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

// El registro es abierto: cualquier taller puede crear su cuenta desde /registro.
router.post('/registro', limitadorAuth, validate({ body: schemas.registro }), async (req, res) => {
  res.status(201).json(await service.registro(req.datos.body));
});

router.post('/login', limitadorAuth, validate({ body: schemas.login }), async (req, res) => {
  res.json(await service.login(req.datos.body));
});

router.get('/me', requireAuth, async (req, res) => {
  res.json(await service.me(req.auth));
});

module.exports = router;

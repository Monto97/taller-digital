const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const validate = require('../../middlewares/validate');
const { textoOpcional } = require('../../utils/esquemas');
const service = require('./publico.service');

// Sin login: el cliente entra con el token del link de WhatsApp.
const router = Router();

// Frena a quien quiera probar tokens por fuerza bruta.
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (_req, res) => res.status(429).json({
    error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos. Probá de nuevo en un minuto.' },
  }),
}));

const paramsToken = z.object({
  token: z.string().regex(/^[0-9a-f]{32}$/, 'Link inválido.'),
});
const rechazo = z.object({ motivo: textoOpcional(500) });

router.get('/ordenes/:token', validate({ params: paramsToken }), async (req, res) => {
  res.json(await service.obtener(req.datos.params.token));
});

router.post('/ordenes/:token/aprobar', validate({ params: paramsToken }), async (req, res) => {
  res.json(await service.aprobar(req.datos.params.token));
});

router.post('/ordenes/:token/rechazar', validate({ params: paramsToken, body: rechazo }), async (req, res) => {
  res.json(await service.rechazar(req.datos.params.token, req.datos.body));
});

module.exports = router;

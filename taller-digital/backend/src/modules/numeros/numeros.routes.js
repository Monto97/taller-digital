const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middlewares/validate');
const service = require('./numeros.service');

// Se monta detrás de requireAuth en app.js: acá req.auth ya existe.
const router = Router();

router.get('/', async (req, res) => {
  res.json(await service.panel(req.auth.tallerId));
});

const entregasQuery = z.object({
  dias: z.coerce.number().int().min(1).max(30).default(7),
});

router.get('/entregas', validate({ query: entregasQuery }), async (req, res) => {
  res.json(await service.entregasRecientes(req.auth.tallerId, req.datos.query.dias));
});

module.exports = router;

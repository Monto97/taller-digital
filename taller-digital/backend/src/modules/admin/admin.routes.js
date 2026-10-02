const { Router } = require('express');
const { z } = require('zod');
const validate = require('../../middlewares/validate');
const { paramsId } = require('../../utils/esquemas');
const authSchemas = require('../auth/auth.schemas');
const AppError = require('../../utils/AppError');
const service = require('./admin.service');

// Se monta detrás de requireAuth + requireAdmin en app.js.
const router = Router();

router.get('/resumen', async (_req, res) => {
  res.json(await service.resumen());
});

router.get('/talleres', async (_req, res) => {
  res.json(await service.talleres());
});

router.post('/talleres', validate({ body: authSchemas.registro }), async (req, res) => {
  res.status(201).json(await service.crearTaller(req.datos.body));
});

router.patch(
  '/talleres/:id',
  validate({ params: paramsId, body: z.object({ activo: z.boolean('Indicá true o false.') }) }),
  async (req, res) => {
    const { id } = req.datos.params;
    if (id === req.auth.tallerId && !req.datos.body.activo) {
      throw AppError.conflicto('PROPIO_TALLER', 'No podés deshabilitar tu propio taller: te dejarías sin acceso.');
    }
    res.json(await service.cambiarHabilitado(id, req.datos.body.activo));
  },
);

module.exports = router;

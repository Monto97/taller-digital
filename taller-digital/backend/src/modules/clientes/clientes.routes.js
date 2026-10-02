const { Router } = require('express');
const validate = require('../../middlewares/validate');
const { requireRol } = require('../../middlewares/auth');
const { paramsId } = require('../../utils/esquemas');
const schemas = require('./clientes.schemas');
const service = require('./clientes.service');

// Se monta detrás de requireAuth en app.js: acá req.auth ya existe.
const router = Router();

router.get('/', validate({ query: schemas.listar }), async (req, res) => {
  res.json(await service.listar(req.auth.tallerId, req.datos.query));
});

router.post('/', validate({ body: schemas.crear }), async (req, res) => {
  res.status(201).json(await service.crear(req.auth.tallerId, req.datos.body));
});

router.get('/:id', validate({ params: paramsId }), async (req, res) => {
  res.json(await service.obtener(req.auth.tallerId, req.datos.params.id));
});

router.patch('/:id', validate({ params: paramsId, body: schemas.editar }), async (req, res) => {
  res.json(await service.editar(req.auth.tallerId, req.datos.params.id, req.datos.body));
});

router.delete('/:id', requireRol('dueno'), validate({ params: paramsId }), async (req, res) => {
  await service.eliminar(req.auth.tallerId, req.datos.params.id);
  res.status(204).end();
});

module.exports = router;

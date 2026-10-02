const { Router } = require('express');
const validate = require('../../middlewares/validate');
const { paramsId } = require('../../utils/esquemas');
const schemas = require('./vehiculos.schemas');
const service = require('./vehiculos.service');

// Se monta detrás de requireAuth en app.js: acá req.auth ya existe.
const router = Router();

router.get('/', validate({ query: schemas.listar }), async (req, res) => {
  res.json(await service.listar(req.auth.tallerId, req.datos.query));
});

// Va antes de /:id para que "patente" no se interprete como un ID.
router.get('/patente/:patente', validate({ params: schemas.paramsPatente }), async (req, res) => {
  res.json(await service.obtenerPorPatente(req.auth.tallerId, req.datos.params.patente));
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

router.get('/:id/historial', validate({ params: paramsId }), async (req, res) => {
  res.json(await service.historial(req.auth.tallerId, req.datos.params.id));
});

module.exports = router;

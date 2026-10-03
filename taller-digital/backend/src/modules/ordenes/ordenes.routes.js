const { Router } = require('express');
const validate = require('../../middlewares/validate');
const { paramsId } = require('../../utils/esquemas');
const schemas = require('./ordenes.schemas');
const service = require('./ordenes.service');

// Se montan detrás de requireAuth en app.js: acá req.auth ya existe.
const router = Router();

router.get('/', validate({ query: schemas.listar }), async (req, res) => {
  res.json(await service.listar(req.auth.tallerId, req.datos.query));
});

router.post('/', validate({ body: schemas.crear }), async (req, res) => {
  res.status(201).json(await service.crear(req.auth, req.datos.body));
});

router.get('/:id', validate({ params: paramsId }), async (req, res) => {
  res.json(await service.obtener(req.auth.tallerId, req.datos.params.id));
});

router.patch('/:id', validate({ params: paramsId, body: schemas.editar }), async (req, res) => {
  res.json(await service.editar(req.auth, req.datos.params.id, req.datos.body));
});

router.post('/:id/estado', validate({ params: paramsId, body: schemas.cambiarEstado }), async (req, res) => {
  res.json(await service.cambiarEstado(req.auth, req.datos.params.id, req.datos.body));
});

router.post('/:id/notas', validate({ params: paramsId, body: schemas.nota }), async (req, res) => {
  res.status(201).json(await service.agregarNota(req.auth, req.datos.params.id, req.datos.body));
});

// --- Ítems del presupuesto ---
router.post('/:id/items', validate({ params: paramsId, body: schemas.item }), async (req, res) => {
  res.status(201).json(await service.agregarItem(req.auth, req.datos.params.id, req.datos.body));
});

router.patch('/:id/items/:itemId', validate({ params: schemas.paramsItem, body: schemas.editarItem }), async (req, res) => {
  const { id, itemId } = req.datos.params;
  res.json(await service.editarItem(req.auth, id, itemId, req.datos.body));
});

router.delete('/:id/items/:itemId', validate({ params: schemas.paramsItem }), async (req, res) => {
  const { id, itemId } = req.datos.params;
  res.json(await service.eliminarItem(req.auth, id, itemId));
});

// --- Presupuesto y WhatsApp ---
router.post('/:id/presupuesto/enviar', validate({ params: paramsId }), async (req, res) => {
  res.json(await service.enviarPresupuesto(req.auth, req.datos.params.id));
});

router.get('/:id/whatsapp', validate({ params: paramsId, query: schemas.plantillaWhatsapp }), async (req, res) => {
  res.json(await service.linkWhatsapp(req.auth.tallerId, req.datos.params.id, req.datos.query.plantilla));
});

router.post('/:id/whatsapp/registrar', validate({ params: paramsId, body: schemas.plantillaWhatsapp }), async (req, res) => {
  await service.registrarAviso(req.auth, req.datos.params.id, req.datos.body.plantilla);
  res.status(204).end();
});

// --- Comprobante en PDF ----------------------------------------------------
const { slugify } = require('../../utils/formato');
router.get('/:id/pdf', validate({ params: paramsId, query: schemas.tipoPdf }), async (req, res) => {
  const { buffer, numero, tipo, patente } = await service.pdf(
    req.auth.tallerId,
    req.datos.params.id,
    req.datos.query.tipo,
  );
  const nombre = `${tipo}-${numero}-${slugify(patente)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
  res.send(buffer);
});

// --- Tablero (se monta en /api/tablero) ---
const tableroRouter = Router();
tableroRouter.get('/', async (req, res) => {
  res.json(await service.tablero(req.auth.tallerId));
});

module.exports = { ordenesRouter: router, tableroRouter };

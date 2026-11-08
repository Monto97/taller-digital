const { Router } = require('express');
const validate = require('../../middlewares/validate');
const { requireRol } = require('../../middlewares/auth');
const schemas = require('./taller.schemas');
const service = require('./taller.service');
const ejemplos = require('./ejemplos');

// Se monta detrás de requireAuth en app.js. Siempre opera sobre el taller del token.
const router = Router();

router.get('/', async (req, res) => {
  res.json(await service.obtener(req.auth.tallerId));
});

// Nombre, teléfono y dirección los cambia solo el dueño.
router.patch('/', requireRol('dueno'), validate({ body: schemas.editar }), async (req, res) => {
  res.json(await service.editar(req.auth.tallerId, req.datos.body));
});

// Borra los autos de ejemplo que se cargaron al registrarse. Solo el dueño.
router.delete('/ejemplos', requireRol('dueno'), async (req, res) => {
  res.json(await ejemplos.borrar(req.auth.tallerId));
});

module.exports = router;

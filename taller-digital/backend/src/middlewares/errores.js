const AppError = require('../utils/AppError');
const env = require('../config/env');

function noEncontrado(req, _res, next) {
  next(new AppError(404, 'NO_ENCONTRADO', `No existe la ruta ${req.method} ${req.originalUrl}.`));
}

// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, _req, res, _next) {
  // JSON mal formado en el body
  if (err.type === 'entity.parse.failed') {
    err = new AppError(400, 'JSON_INVALIDO', 'El cuerpo del request no es un JSON válido.');
  }

  if (err instanceof AppError) {
    const error = { codigo: err.codigo, mensaje: err.message };
    if (err.detalles) error.detalles = err.detalles;
    return res.status(err.status).json({ error });
  }

  // Cualquier otra cosa es un error nuestro: se loguea y no se exponen detalles.
  console.error(err);
  const error = { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado.' };
  if (env.NODE_ENV === 'development') error.debug = err.message;
  return res.status(500).json({ error });
}

module.exports = { noEncontrado, manejadorErrores };

const AppError = require('../utils/AppError');

/**
 * Valida body, query y/o params con esquemas de zod.
 * Los datos ya validados y transformados quedan en req.datos.{body,query,params}.
 * (En Express 5 req.query es de solo lectura, por eso no se pisa.)
 *
 * Uso: router.post('/', validate({ body: esquemaCrear }), handler)
 */
function validate(esquemas) {
  return (req, _res, next) => {
    req.datos = req.datos || {};
    const detalles = {};

    for (const parte of ['body', 'query', 'params']) {
      const esquema = esquemas[parte];
      if (!esquema) continue;
      const resultado = esquema.safeParse(req[parte] ?? {});
      if (resultado.success) {
        req.datos[parte] = resultado.data;
      } else {
        for (const issue of resultado.error.issues) {
          const campo = issue.path.join('.') || parte;
          detalles[campo] = issue.message;
        }
      }
    }

    if (Object.keys(detalles).length > 0) return next(AppError.validacion(detalles));
    return next();
  };
}

module.exports = validate;

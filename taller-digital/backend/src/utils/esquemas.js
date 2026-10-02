const { z } = require('zod');

/** ?pagina=1&por_pagina=20 (máximo 100) */
const paginacion = {
  pagina: z.coerce.number().int().min(1).default(1),
  por_pagina: z.coerce.number().int().min(1).max(100).default(20),
};

/** Para rutas tipo /recurso/:id */
const paramsId = z.object({
  id: z.coerce.number().int().positive('ID inválido.'),
});

/** Texto opcional: "" se convierte en null para poder borrar un campo desde el front. */
const textoOpcional = (max) => z
  .string()
  .trim()
  .max(max)
  .transform((v) => (v === '' ? null : v))
  .nullish();

function respuestaPaginada(datos, total, { pagina, por_pagina }) {
  return { datos, pagina, por_pagina, total };
}

module.exports = { paginacion, paramsId, textoOpcional, respuestaPaginada };

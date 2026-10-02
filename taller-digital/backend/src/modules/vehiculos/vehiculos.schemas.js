const { z } = require('zod');
const { paginacion, textoOpcional } = require('../../utils/esquemas');
const { normalizarPatente, esPatenteValida } = require('../../utils/formato');
const clientesSchemas = require('../clientes/clientes.schemas');

const anioMax = new Date().getFullYear() + 1;

const patente = z
  .string()
  .transform(normalizarPatente)
  .pipe(z.string().min(5, 'La patente es muy corta.').max(10, 'La patente es muy larga.'));

const camposVehiculo = {
  patente,
  tipo: z.enum(['auto', 'moto'], 'El tipo tiene que ser auto o moto.'),
  marca: textoOpcional(60),
  modelo: textoOpcional(80),
  anio: z.coerce.number().int().min(1950).max(anioMax, `El año no puede ser mayor a ${anioMax}.`).nullish(),
  color: textoOpcional(40),
  km_actual: z.coerce.number().int().min(0).max(2_000_000).nullish(),
  notas: textoOpcional(2000),
  // Para patentes extranjeras o formatos raros: saltea la validación de formato argentino.
  formato_libre: z.boolean().optional(),
};

/** Valida el formato argentino salvo que se pida formato_libre. */
function validarFormatoPatente(datos, ctx) {
  if (datos.patente && !datos.formato_libre && !esPatenteValida(datos.patente)) {
    ctx.addIssue({
      code: 'custom',
      path: ['patente'],
      message: 'La patente no tiene un formato argentino válido (ej. AB123CD, ABC123, A123BCD o 123ABC).',
    });
  }
}

const crear = z
  .object({
    ...camposVehiculo,
    tipo: camposVehiculo.tipo.default('auto'),
    cliente_id: z.coerce.number().int().positive().optional(),
    cliente: clientesSchemas.crear.optional(),
  })
  .superRefine(validarFormatoPatente)
  .superRefine((d, ctx) => {
    if (!d.cliente_id === !d.cliente) {
      ctx.addIssue({
        code: 'custom',
        path: ['cliente_id'],
        message: 'Indicá un cliente existente (cliente_id) o los datos de uno nuevo (cliente), no ambos.',
      });
    }
  });

const editar = z
  .object({
    ...camposVehiculo,
    cliente_id: z.coerce.number().int().positive(),
  })
  .partial()
  .superRefine(validarFormatoPatente)
  .refine((d) => Object.keys(d).some((k) => k !== 'formato_libre'), 'No hay nada para actualizar.');

const listar = z.object({
  q: z.string().trim().max(100).optional(),
  tipo: z.enum(['auto', 'moto']).optional(),
  cliente_id: z.coerce.number().int().positive().optional(),
  ...paginacion,
});

const paramsPatente = z.object({
  patente: z.string().transform(normalizarPatente).pipe(z.string().min(1, 'Patente inválida.')),
});

module.exports = { crear, editar, listar, paramsPatente };

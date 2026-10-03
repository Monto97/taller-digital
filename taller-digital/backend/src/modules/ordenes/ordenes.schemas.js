const { z } = require('zod');
const { paginacion, textoOpcional } = require('../../utils/esquemas');
const vehiculosSchemas = require('../vehiculos/vehiculos.schemas');
const { ESTADOS } = require('./ordenes.estados');

const fechaOpcional = z
  .union([z.iso.date('Fecha inválida, usá AAAA-MM-DD.'), z.literal('')])
  .transform((v) => (v === '' ? null : v))
  .nullish();
const idOpcional = z.coerce.number().int().positive().nullish();

const crear = z
  .object({
    vehiculo_id: z.coerce.number().int().positive().optional(),
    vehiculo: vehiculosSchemas.crear.optional(),
    motivo: z.string().trim().min(3, 'Contá qué le pasa al vehículo.').max(2000),
    km_ingreso: z.coerce.number().int().min(0).max(2_000_000).nullish(),
    mecanico_id: idOpcional,
    fecha_estimada_entrega: fechaOpcional,
  })
  .superRefine((d, ctx) => {
    if (!d.vehiculo_id === !d.vehiculo) {
      ctx.addIssue({
        code: 'custom',
        path: ['vehiculo_id'],
        message: 'Indicá un vehículo existente (vehiculo_id) o los datos de uno nuevo (vehiculo), no ambos.',
      });
    }
  });

const editar = z
  .object({
    motivo: z.string().trim().min(3).max(2000),
    diagnostico: textoOpcional(5000),
    km_ingreso: z.coerce.number().int().min(0).max(2_000_000).nullable(),
    mecanico_id: idOpcional,
    fecha_estimada_entrega: fechaOpcional,
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'No hay nada para actualizar.');

const cambiarEstado = z.object({
  estado: z.enum(ESTADOS, 'Estado inválido.'),
  detalle: textoOpcional(500),
});

const nota = z.object({
  detalle: z.string().trim().min(1, 'Escribí la nota.').max(500),
});

const csvEstados = z
  .string()
  .transform((v) => v.split(',').map((e) => e.trim()).filter(Boolean))
  .pipe(z.array(z.enum(ESTADOS, 'Estado inválido.')).min(1));

const listar = z.object({
  estado: csvEstados.optional(),
  activas: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  mecanico_id: z.coerce.number().int().positive().optional(),
  vehiculo_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
  ...paginacion,
});

const item = z.object({
  tipo: z.enum(['repuesto', 'mano_de_obra', 'otro'], 'El tipo tiene que ser repuesto, mano_de_obra u otro.'),
  descripcion: z.string().trim().min(1, 'Describí el ítem.').max(200),
  cantidad: z.coerce.number().positive('La cantidad tiene que ser mayor a 0.').max(99999).default(1),
  precio_unitario: z.coerce.number().min(0, 'El precio no puede ser negativo.').max(9_999_999_999),
});

const editarItem = item.partial().refine((d) => Object.keys(d).length > 0, 'No hay nada para actualizar.');

const paramsItem = z.object({
  id: z.coerce.number().int().positive(),
  itemId: z.coerce.number().int().positive(),
});

const plantillaWhatsapp = z.object({
  plantilla: z.enum(['recibido', 'presupuesto', 'listo', 'pdf'], 'Plantilla inválida.'),
});

const tipoPdf = z.object({
  tipo: z.enum(['presupuesto', 'comprobante']).optional(),
});

module.exports = { crear, editar, cambiarEstado, nota, listar, item, editarItem, paramsItem, plantillaWhatsapp, tipoPdf };

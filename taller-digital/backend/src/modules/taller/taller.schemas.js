const { z } = require('zod');
const { textoOpcional } = require('../../utils/esquemas');
const { normalizarTelefono } = require('../../utils/formato');

const editar = z
  .object({
    nombre: z.string().trim().min(2, 'Ingresá el nombre del taller.').max(120),
    // "" o null borran el teléfono; si viene, se guarda normalizado para los links wa.me.
    telefono: z.string().trim().max(30).transform(normalizarTelefono).nullish(),
    direccion: textoOpcional(200),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'No hay nada para actualizar.');

module.exports = { editar };

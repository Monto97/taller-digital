const { z } = require('zod');
const { paginacion, textoOpcional } = require('../../utils/esquemas');
const { normalizarTelefono } = require('../../utils/formato');

const nombre = z.string().trim().min(2, 'Ingresá el nombre del cliente.').max(120);
const telefono = z
  .string()
  .trim()
  .max(30)
  .transform(normalizarTelefono)
  .nullish();
const email = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => (v === '' ? null : v))
  .pipe(z.email('Email inválido.').nullable())
  .nullish();

const crear = z.object({
  nombre,
  telefono,
  email,
  notas: textoOpcional(2000),
});

const editar = crear.partial().refine((d) => Object.keys(d).length > 0, 'No hay nada para actualizar.');

const listar = z.object({
  q: z.string().trim().max(100).optional(),
  ...paginacion,
});

module.exports = { crear, editar, listar };

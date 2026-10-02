const { z } = require('zod');

const email = z.string().trim().toLowerCase().pipe(z.email('Email inválido.'));
const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(72);

const registro = z.object({
  taller: z.object({
    nombre: z.string().trim().min(2, 'Ingresá el nombre del taller.').max(120),
    telefono: z.string().trim().max(30).optional(),
    direccion: z.string().trim().max(200).optional(),
  }),
  usuario: z.object({
    nombre: z.string().trim().min(2, 'Ingresá tu nombre.').max(120),
    email,
    password,
  }),
});

const login = z.object({
  email,
  password: z.string().min(1, 'Ingresá la contraseña.'),
});

module.exports = { registro, login };

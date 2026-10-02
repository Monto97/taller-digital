const path = require('node:path');
const fs = require('node:fs');

// En producción las variables vienen del hosting, no de un archivo.
const rutaEnv = process.env.DOTENV_PATH || path.join(__dirname, '../../.env');
if (fs.existsSync(rutaEnv)) {
  require('dotenv').config({ path: rutaEnv, quiet: true });
} else if (process.env.NODE_ENV !== 'production') {
  console.error(`No se encontró el archivo de entorno: ${rutaEnv}`);
  console.error('Copiá el .example correspondiente (.env.example o .env.test.example).');
  process.exit(1);
}
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('taller_digital'),
  DB_SOCKET: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PUBLIC_APP_URL: z.url().default('http://localhost:4200'),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  // Si está definida, POST /auth/registro exige el header X-Clave-Registro con este valor.
  // En producción, sin esta variable el registro queda cerrado.
  REGISTRO_CLAVE: z.string().min(12, 'REGISTRO_CLAVE debe tener al menos 12 caracteres').optional(),
  // Carpeta con el build de Angular. Si está definida, la API también sirve el frontend.
  FRONTEND_DIST: z.string().optional(),
  // Emails con acceso al panel de admin (/admin), separados por coma. Es para vos, no para los talleres.
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Variables de entorno inválidas:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

module.exports = parsed.data;

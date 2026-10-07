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
  // Carpeta con el build de Angular. Si está definida, la API también sirve el frontend.
  FRONTEND_DIST: z.string().optional(),
  // Emails con acceso al panel de admin (/admin), separados por coma. Es para vos, no para los talleres.
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)),
  // Credenciales de la aplicación de Mercado Pago (una por entorno). Si están vacías,
  // el módulo de MP responde "no configurado" y no se puede conectar ningún taller.
  MP_CLIENT_ID: z.string().default(''),
  MP_CLIENT_SECRET: z.string().default(''),
  // URL a la que MP devuelve el `code` tras autorizar. Debe estar registrada en el app de MP.
  // Si no se define, se arma desde PUBLIC_APP_URL.
  MP_REDIRECT_URI: z.string().default(''),
  // Secreto para validar la firma del webhook (header x-signature). Si está vacío,
  // el webhook igual funciona (verifica cada orden contra MP), pero en producción conviene cargarlo.
  MP_WEBHOOK_SECRET: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Variables de entorno inválidas:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

const datos = parsed.data;
if (!datos.MP_REDIRECT_URI) {
  datos.MP_REDIRECT_URI = `${datos.PUBLIC_APP_URL.replace(/\/$/, '')}/api/mp/oauth/callback`;
}

module.exports = datos;

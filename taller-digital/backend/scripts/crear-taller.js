/**
 * Da de alta un taller con su usuario dueño desde la terminal, sin pasar
 * por la pantalla de registro.
 *
 *   node scripts/crear-taller.js "Taller Rodríguez" "Diego Rodríguez" diego@mail.com "clave-segura" "2241 15 68-9216"
 *
 * El último dato (teléfono del taller) es opcional; se usa para que el cliente
 * pueda escribirle al taller desde el link de seguimiento.
 */
const { registro } = require('../src/modules/auth/auth.service');
const schemas = require('../src/modules/auth/auth.schemas');
const { pool } = require('../src/db/pool');

async function main() {
  const [nombreTaller, nombreUsuario, email, password, telefono] = process.argv.slice(2);
  if (!nombreTaller || !nombreUsuario || !email || !password) {
    console.log('Uso: node scripts/crear-taller.js "Nombre del taller" "Nombre del dueño" email contraseña ["teléfono del taller"]');
    process.exit(1);
  }

  const datos = schemas.registro.safeParse({
    taller: { nombre: nombreTaller, telefono },
    usuario: { nombre: nombreUsuario, email, password },
  });
  if (!datos.success) {
    for (const issue of datos.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    process.exit(1);
  }

  const res = await registro(datos.data);
  console.log(`Listo: taller "${res.taller.nombre}" (id ${res.taller.id}). Ya puede entrar con ${res.usuario.email}.`);
}

main()
  .catch((err) => {
    console.error(err.codigo ? `${err.codigo}: ${err.message}` : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

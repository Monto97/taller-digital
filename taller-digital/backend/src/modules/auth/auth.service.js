const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const { slugify, normalizarTelefono } = require('../../utils/formato');
const { firmarToken, esAdmin } = require('../../middlewares/auth');

const BCRYPT_ROUNDS = 12;
// Hash de relleno: se compara igual cuando el email no existe, para no revelar
// por diferencia de tiempo qué emails están registrados.
const HASH_FALSO = bcrypt.hashSync('contraseña-que-no-existe', BCRYPT_ROUNDS);

function armarRespuesta(usuario, taller) {
  return {
    token: firmarToken(usuario),
    usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, admin: esAdmin(usuario.email) },
    taller: { id: taller.id, nombre: taller.nombre, slug: taller.slug },
  };
}

/** Busca un slug libre: taller-rodriguez, taller-rodriguez-2, taller-rodriguez-3... */
async function slugDisponible(conn, nombre) {
  const base = slugify(nombre);
  const [filas] = await conn.query(
    'SELECT slug FROM talleres WHERE slug = ? OR slug LIKE ?',
    [base, `${base}-%`],
  );
  const usados = new Set(filas.map((f) => f.slug));
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

async function registro({ taller, usuario }) {
  const [existentes] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [usuario.email]);
  if (existentes.length > 0) {
    throw AppError.conflicto('EMAIL_EN_USO', 'Ya existe una cuenta con ese email.');
  }

  const passwordHash = await bcrypt.hash(usuario.password, BCRYPT_ROUNDS);

  try {
    return await withTransaction(async (conn) => {
      const slug = await slugDisponible(conn, taller.nombre);
      const [resTaller] = await conn.query(
        'INSERT INTO talleres (nombre, slug, telefono, direccion) VALUES (?, ?, ?, ?)',
        [taller.nombre, slug, normalizarTelefono(taller.telefono), taller.direccion ?? null],
      );
      const tallerId = resTaller.insertId;

      const [resUsuario] = await conn.query(
        `INSERT INTO usuarios (taller_id, nombre, email, password_hash, rol)
         VALUES (?, ?, ?, ?, 'dueno')`,
        [tallerId, usuario.nombre, usuario.email, passwordHash],
      );

      return armarRespuesta(
        { id: resUsuario.insertId, taller_id: tallerId, nombre: usuario.nombre, email: usuario.email, rol: 'dueno' },
        { id: tallerId, nombre: taller.nombre, slug },
      );
    });
  } catch (err) {
    // Carrera: otro registro con el mismo email entró entre el chequeo y el INSERT.
    if (err.code === 'ER_DUP_ENTRY' && err.message.includes('uq_usuarios_email')) {
      throw AppError.conflicto('EMAIL_EN_USO', 'Ya existe una cuenta con ese email.');
    }
    throw err;
  }
}

async function login({ email, password }) {
  const [filas] = await pool.query(
    `SELECT u.id, u.taller_id, u.nombre, u.email, u.password_hash, u.rol, u.activo,
            t.nombre AS taller_nombre, t.slug AS taller_slug, t.activo AS taller_activo
       FROM usuarios u
       JOIN talleres t ON t.id = u.taller_id
      WHERE u.email = ?`,
    [email],
  );
  const usuario = filas[0];

  const passwordOk = await bcrypt.compare(password, usuario ? usuario.password_hash : HASH_FALSO);
  if (!usuario || !passwordOk) {
    throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');
  }
  if (!usuario.activo || !usuario.taller_activo) {
    throw new AppError(403, 'CUENTA_INACTIVA', 'La cuenta está desactivada. Hablá con el dueño del taller.');
  }

  await pool.query('UPDATE usuarios SET ultimo_login_at = UTC_TIMESTAMP() WHERE id = ?', [usuario.id]);

  return armarRespuesta(usuario, { id: usuario.taller_id, nombre: usuario.taller_nombre, slug: usuario.taller_slug });
}

async function me({ usuarioId, tallerId }) {
  const [filas] = await pool.query(
    `SELECT u.id, u.nombre, u.email, u.rol,
            t.id AS taller_id, t.nombre AS taller_nombre, t.slug AS taller_slug,
            t.telefono AS taller_telefono, t.direccion AS taller_direccion, t.logo_url AS taller_logo_url
       FROM usuarios u
       JOIN talleres t ON t.id = u.taller_id
      WHERE u.id = ? AND u.taller_id = ? AND u.activo = 1 AND t.activo = 1`,
    [usuarioId, tallerId],
  );
  const f = filas[0];
  if (!f) throw AppError.noAutenticado();

  return {
    usuario: { id: f.id, nombre: f.nombre, email: f.email, rol: f.rol, admin: esAdmin(f.email) },
    taller: {
      id: f.taller_id,
      nombre: f.taller_nombre,
      slug: f.taller_slug,
      telefono: f.taller_telefono,
      direccion: f.taller_direccion,
      logo_url: f.taller_logo_url,
    },
  };
}

module.exports = { registro, login, me };

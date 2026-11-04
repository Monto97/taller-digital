const { pool } = require('../../db/pool');
const AppError = require('../../utils/AppError');

/**
 * Datos del propio taller (el del token). El slug no se toca al cambiar el
 * nombre: es un identificador interno y no tiene por qué seguir al nombre.
 */
async function obtener(tallerId) {
  const [filas] = await pool.query(
    'SELECT id, nombre, slug, telefono, direccion, logo_url FROM talleres WHERE id = ?',
    [tallerId],
  );
  if (!filas[0]) throw AppError.noEncontrado('El taller');
  return filas[0];
}

const CAMPOS = ['nombre', 'telefono', 'direccion'];

async function editar(tallerId, datos) {
  const campos = CAMPOS.filter((c) => datos[c] !== undefined);
  if (campos.length > 0) {
    await pool.query(
      `UPDATE talleres SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...campos.map((c) => datos[c]), tallerId],
    );
  }
  return obtener(tallerId);
}

module.exports = { obtener, editar };

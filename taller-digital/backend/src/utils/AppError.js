/**
 * Error de negocio con un código estable que el front puede interpretar.
 * Se responde como: { error: { codigo, mensaje, detalles? } }
 */
class AppError extends Error {
  constructor(status, codigo, mensaje, detalles) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }

  static validacion(detalles) {
    return new AppError(400, 'VALIDACION', 'Hay datos inválidos o incompletos.', detalles);
  }

  static noAutenticado(mensaje = 'Tenés que iniciar sesión.') {
    return new AppError(401, 'NO_AUTENTICADO', mensaje);
  }

  static sinPermiso() {
    return new AppError(403, 'SIN_PERMISO', 'No tenés permiso para hacer esto.');
  }

  static noEncontrado(recurso = 'El recurso') {
    return new AppError(404, 'NO_ENCONTRADO', `${recurso} no existe.`);
  }

  static conflicto(codigo, mensaje) {
    return new AppError(409, codigo, mensaje);
  }
}

module.exports = AppError;

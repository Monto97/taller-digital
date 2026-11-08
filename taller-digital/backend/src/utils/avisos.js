const env = require('../config/env');
const { normalizarTelefono } = require('./formato');

/**
 * Avisos para el dueño del sistema (no para los talleres).
 * Usan ntfy.sh: instalás la app ntfy en el celular, te suscribís al tema de
 * AVISO_REGISTRO_URL y te llega una notificación por cada taller nuevo.
 * Nunca lanzan error: un aviso que falla no puede romper el registro.
 */
async function enviar({ titulo, mensaje, link, tags }) {
  if (!env.AVISO_REGISTRO_URL) return false;
  try {
    const headers = { 'Content-Type': 'text/plain; charset=utf-8', Title: encodeURIComponent(titulo) };
    if (link) headers.Click = link;
    if (tags) headers.Tags = tags;
    const res = await fetch(env.AVISO_REGISTRO_URL, {
      method: 'POST',
      headers,
      body: mensaje,
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    console.error('No se pudo enviar el aviso:', err.message);
    return false;
  }
}

/** Taller que se registró solo desde /registro. */
function nuevoRegistro({ taller, usuario }, creado) {
  const telefono = normalizarTelefono(taller.telefono);
  const lineas = [
    `${taller.nombre}`,
    `${usuario.nombre} · ${usuario.email}`,
    telefono ? `WhatsApp: +${telefono}` : 'Sin teléfono',
  ];
  if (taller.direccion) lineas.push(taller.direccion);
  return enviar({
    titulo: 'Nuevo taller registrado',
    mensaje: lineas.join('\n'),
    link: telefono ? `https://wa.me/${telefono}` : undefined,
    tags: 'wrench,tada',
  }).then((ok) => ok && creado);
}

module.exports = { enviar, nuevoRegistro };

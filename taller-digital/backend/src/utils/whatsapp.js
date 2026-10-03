const env = require('../config/env');
const { formatearPatente, formatearPesos } = require('./formato');

/** Link al que entra el cliente para ver su orden, sin login. */
function linkPublico(token) {
  return `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/o/${token}`;
}

/** Link directo al PDF del comprobante, también por token. */
function linkPublicoPdf(token) {
  return `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/api/publico/ordenes/${token}/pdf`;
}

/** Link de WhatsApp con el mensaje ya escrito: el taller lo abre y solo toca "enviar". */
function linkWhatsapp(telefono, texto) {
  return `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`;
}

/**
 * Mensajes por plantilla. Recibe la orden con: numero, total, token_publico,
 * cliente.nombre, vehiculo.{marca, modelo, patente, tipo}, taller.nombre
 */
const PLANTILLAS = {
  recibido: (o) =>
    `¡Hola ${primerNombre(o.cliente.nombre)}! Recibimos tu ${describir(o.vehiculo)} en ${o.taller.nombre}. ` +
    `Orden n.º ${o.numero}.\n\nPodés seguir el estado acá: ${linkPublico(o.token_publico)}`,

  presupuesto: (o) =>
    `Hola ${primerNombre(o.cliente.nombre)}, ya tenemos el diagnóstico de tu ${describir(o.vehiculo)}. ` +
    `El presupuesto es de ${formatearPesos(o.total)}.\n\nRevisalo y aprobalo acá: ${linkPublico(o.token_publico)}`,

  listo: (o) =>
    `¡Hola ${primerNombre(o.cliente.nombre)}! Tu ${describir(o.vehiculo)} ya está listo para retirar en ${o.taller.nombre}. ` +
    `Total: ${formatearPesos(o.total)}.\n\nDetalle del trabajo: ${linkPublico(o.token_publico)}`,

  pdf: (o) =>
    `Hola ${primerNombre(o.cliente.nombre)}, te paso en PDF el detalle del trabajo de tu ${describir(o.vehiculo)}: ` +
    `${linkPublicoPdf(o.token_publico)}`,
};

function primerNombre(nombre) {
  return String(nombre).trim().split(/\s+/)[0];
}

function describir(v) {
  const modelo = [v.marca, v.modelo].filter(Boolean).join(' ') || (v.tipo === 'moto' ? 'moto' : 'auto');
  return `${modelo} ${formatearPatente(v.patente)}`;
}

function mensaje(plantilla, orden) {
  return PLANTILLAS[plantilla](orden);
}

module.exports = { linkPublico, linkPublicoPdf, linkWhatsapp, mensaje };

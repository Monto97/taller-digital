/**
 * Estados de la orden de trabajo y transiciones permitidas.
 * Es la única fuente de verdad: el backend rechaza cualquier cambio que no esté acá.
 */

const ESTADOS = ['recibido', 'diagnostico', 'esperando_aprobacion', 'en_reparacion', 'listo', 'entregado', 'cancelada'];

const ESTADOS_ACTIVOS = ['recibido', 'diagnostico', 'esperando_aprobacion', 'en_reparacion', 'listo'];
const ESTADOS_CERRADOS = ['entregado', 'cancelada'];

// Estados en los que puede nacer una orden. Al recibir el vehículo el taller ya sabe
// si hay que revisarlo (diagnostico) o si el trabajo ya está claro (en_reparacion);
// obligar a pasar por diagnóstico sería anotar un paso que nunca ocurrió.
const ESTADOS_INICIALES = ['recibido', 'diagnostico', 'en_reparacion'];

const ETIQUETAS = {
  recibido: 'Recibido',
  diagnostico: 'En diagnóstico',
  esperando_aprobacion: 'Esperando aprobación',
  en_reparacion: 'En reparación',
  listo: 'Listo para retirar',
  entregado: 'Entregado',
  cancelada: 'Cancelada',
};

// esperando_aprobacion no aparece como destino: solo se llega enviando el presupuesto
// (POST /ordenes/:id/presupuesto/enviar), para que siempre quede registrado el envío.
const TRANSICIONES = {
  recibido: ['diagnostico', 'en_reparacion', 'cancelada'],
  diagnostico: ['en_reparacion', 'cancelada'],
  esperando_aprobacion: ['diagnostico', 'en_reparacion', 'cancelada'],
  en_reparacion: ['listo', 'cancelada'],
  listo: ['entregado', 'en_reparacion'],
  entregado: [],
  cancelada: [],
};

function puedeTransicionar(desde, hasta) {
  return (TRANSICIONES[desde] || []).includes(hasta);
}

module.exports = { ESTADOS, ESTADOS_ACTIVOS, ESTADOS_CERRADOS, ESTADOS_INICIALES, ETIQUETAS, TRANSICIONES, puedeTransicionar };

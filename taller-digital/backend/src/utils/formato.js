/** Normaliza una patente: mayúsculas, sin espacios, guiones ni puntos. "ae-482 kt" -> "AE482KT" */
function normalizarPatente(valor) {
  return String(valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Formatos argentinos: auto anterior ABC123, auto Mercosur AB123CD,
// moto anterior 123ABC, moto Mercosur A123BCD.
const FORMATOS_PATENTE = [
  /^[A-Z]{3}\d{3}$/,
  /^[A-Z]{2}\d{3}[A-Z]{2}$/,
  /^\d{3}[A-Z]{3}$/,
  /^[A-Z]\d{3}[A-Z]{3}$/,
];

function esPatenteValida(patenteNormalizada) {
  return FORMATOS_PATENTE.some((re) => re.test(patenteNormalizada));
}

/** Para mostrar: "AE482KT" -> "AE 482 KT", "ABC123" -> "ABC 123", "A057JKR" -> "A057 JKR" */
function formatearPatente(p) {
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p)) return `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5)}`;
  if (/^[A-Z]{3}\d{3}$/.test(p) || /^\d{3}[A-Z]{3}$/.test(p)) return `${p.slice(0, 3)} ${p.slice(3)}`;
  if (/^[A-Z]\d{3}[A-Z]{3}$/.test(p)) return `${p.slice(0, 4)} ${p.slice(4)}`;
  return p;
}

const FORMATO_PESOS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

/** 486000 -> "$ 486.000" */
function formatearPesos(monto) {
  return FORMATO_PESOS.format(Number(monto)).replace(/\u00a0/g, ' ');
}

/** "Taller Rodríguez & Hijos" -> "taller-rodriguez-hijos" */
function slugify(texto) {
  const slug = String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return slug || 'taller';
}

/**
 * Lleva un teléfono al formato que necesita wa.me (solo dígitos, con código de país).
 *   "+54 9 221 555-0143" -> "5492215550143"
 *   "221 555-0143"       -> "5492215550143"  (celular argentino de 10 dígitos)
 *   "0221 15 555-0143"   -> "5492215550143"  (con 0 de larga distancia y 15)
 * Si no reconoce el formato, devuelve solo los dígitos tal cual.
 */
function normalizarTelefono(valor) {
  if (valor == null || valor === '') return null;
  let d = String(valor).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('54')) return d;

  d = d.replace(/^0/, '');
  // Quita el "15" de celulares: código de área (2 a 4 dígitos) + 15 + número.
  if (d.length === 12) {
    for (const largoArea of [2, 3, 4]) {
      if (d.slice(largoArea, largoArea + 2) === '15') {
        d = d.slice(0, largoArea) + d.slice(largoArea + 2);
        break;
      }
    }
  }
  return d.length === 10 ? `549${d}` : d;
}

module.exports = {
  normalizarPatente, esPatenteValida, formatearPatente, formatearPesos, slugify, normalizarTelefono,
};

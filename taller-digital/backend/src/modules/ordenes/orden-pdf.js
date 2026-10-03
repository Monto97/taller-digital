const PDFDocument = require('pdfkit');
const { formatearPatente, formatearPesos } = require('../../utils/formato');

/**
 * Comprobante no fiscal de la orden (presupuesto o trabajo entregado).
 * Pensado para que el dueño lo mande por WhatsApp al cliente: una sola hoja A4,
 * datos del taller con logo opcional, detalle y total.
 */

const TIPO_ITEM = { repuesto: 'Repuesto', mano_de_obra: 'Mano de obra', otro: 'Otro' };

/** Elige el título según el estado si no se forzó por query. */
function tipoPorEstado(estado) {
  if (['recibido', 'diagnostico', 'esperando_aprobacion'].includes(estado)) return 'presupuesto';
  return 'comprobante';
}

/** Baja el logo de la URL con un tope corto. Si falla, se sigue sin logo. */
async function cargarLogo(url) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const tipo = res.headers.get('content-type') ?? '';
    if (!tipo.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf;
  } catch {
    return null;
  }
}

function formatearFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Genera el PDF y lo devuelve como Buffer.
 * `datos` tiene la forma: { taller, orden, cliente, vehiculo, items, tipo }.
 */
async function generarPdf({ taller, orden, cliente, vehiculo, items, tipo }) {
  const logo = await cargarLogo(taller.logo_url);
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: {
    Title: `${tipo === 'presupuesto' ? 'Presupuesto' : 'Comprobante'} N.º ${orden.numero}`,
    Author: taller.nombre,
  } });

  const chunks = [];
  const buffer = new Promise((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const izq = doc.page.margins.left;

  // --- Encabezado: logo (si hay) a la izquierda, título y fecha a la derecha ---
  const topY = doc.y;
  if (logo) {
    try { doc.image(logo, izq, topY, { fit: [100, 60] }); } catch { /* logo roto, sigo */ }
  }
  doc.font('Helvetica-Bold').fontSize(18)
    .text(tipo === 'presupuesto' ? 'PRESUPUESTO' : 'COMPROBANTE', izq, topY, { align: 'right', width: ancho });
  doc.font('Helvetica').fontSize(12)
    .text(`N.º ${orden.numero}`, { align: 'right', width: ancho });
  doc.fontSize(10)
    .text(`Fecha: ${formatearFecha(new Date())}`, { align: 'right', width: ancho });

  doc.moveDown(2);
  doc.font('Helvetica-Bold').fontSize(14).text(taller.nombre, izq);
  const subTaller = [taller.telefono, taller.direccion].filter(Boolean).join(' · ');
  if (subTaller) doc.font('Helvetica').fontSize(10).fillColor('#555').text(subTaller);
  doc.fillColor('#000');

  linea(doc, izq, ancho);

  // --- Datos del cliente, vehículo y motivo ---
  bloque(doc, 'CLIENTE', [cliente.nombre, cliente.telefono].filter(Boolean));

  const nombreVehiculo = [vehiculo.marca, vehiculo.modelo, vehiculo.anio].filter(Boolean).join(' ')
    || (vehiculo.tipo === 'moto' ? 'Moto' : 'Auto');
  const km = vehiculo.km_actual != null ? `${Number(vehiculo.km_actual).toLocaleString('es-AR')} km` : null;
  bloque(doc, 'VEHÍCULO', [`${formatearPatente(vehiculo.patente)} · ${nombreVehiculo}`, km].filter(Boolean));

  bloque(doc, 'QUÉ HAY QUE HACER', [orden.motivo]);
  if (orden.diagnostico) bloque(doc, 'DIAGNÓSTICO', [orden.diagnostico]);

  linea(doc, izq, ancho);

  // --- Tabla de ítems ---
  doc.font('Helvetica-Bold').fontSize(11).text('DETALLE', izq);
  doc.moveDown(0.5);

  const colX = {
    tipo: izq,
    desc: izq + 85,
    cant: izq + ancho - 180,
    precio: izq + ancho - 120,
    sub: izq + ancho,
  };
  const yEnc = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#555');
  doc.text('TIPO', colX.tipo, yEnc);
  doc.text('DESCRIPCIÓN', colX.desc, yEnc);
  doc.text('CANT.', colX.cant - 10, yEnc, { width: 40, align: 'right' });
  doc.text('PRECIO', colX.precio - 10, yEnc, { width: 60, align: 'right' });
  doc.text('SUBTOTAL', colX.sub - 80, yEnc, { width: 80, align: 'right' });
  doc.fillColor('#000');
  doc.moveTo(izq, yEnc + 14).lineTo(izq + ancho, yEnc + 14).lineWidth(0.5).strokeColor('#aaa').stroke();
  doc.strokeColor('#000');
  doc.y = yEnc + 20;

  doc.font('Helvetica').fontSize(10);
  if (items.length === 0) {
    doc.fillColor('#777').text('Todavía no hay ítems cargados.', izq, doc.y);
    doc.fillColor('#000');
  }
  for (const it of items) {
    const y = doc.y;
    const cantidad = Number(it.cantidad);
    const precio = Number(it.precio_unitario);
    const subtotal = cantidad * precio;
    const descAlto = doc.heightOfString(it.descripcion, { width: colX.cant - colX.desc - 10 });
    doc.text(TIPO_ITEM[it.tipo] ?? it.tipo, colX.tipo, y, { width: 75 });
    doc.text(it.descripcion, colX.desc, y, { width: colX.cant - colX.desc - 10 });
    doc.text(cantidad.toLocaleString('es-AR', { maximumFractionDigits: 2 }), colX.cant - 10, y, { width: 40, align: 'right' });
    doc.text(formatearPesos(precio), colX.precio - 10, y, { width: 60, align: 'right' });
    doc.text(formatearPesos(subtotal), colX.sub - 80, y, { width: 80, align: 'right' });
    doc.y = y + Math.max(descAlto, 12) + 4;
  }

  doc.moveTo(izq, doc.y + 2).lineTo(izq + ancho, doc.y + 2).lineWidth(0.5).strokeColor('#aaa').stroke();
  doc.strokeColor('#000');
  doc.moveDown(0.8);

  // --- Total ---
  const total = items.reduce((s, it) => s + Number(it.cantidad) * Number(it.precio_unitario), 0);
  const yTot = doc.y;
  doc.font('Helvetica-Bold').fontSize(14);
  doc.text('TOTAL', izq, yTot, { width: ancho - 120, align: 'right' });
  doc.text(formatearPesos(total), izq + ancho - 110, yTot, { width: 110, align: 'right' });
  doc.moveDown(2);

  // --- Pie ---
  linea(doc, izq, ancho);
  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#555')
    .text('Comprobante no fiscal. Vale como presupuesto o constancia de los trabajos realizados.', izq, doc.y + 2);
  doc.fillColor('#000');

  doc.end();
  return buffer;
}

function linea(doc, x, ancho) {
  doc.moveDown(0.6);
  const y = doc.y;
  doc.moveTo(x, y).lineTo(x + ancho, y).lineWidth(0.5).strokeColor('#ccc').stroke();
  doc.strokeColor('#000');
  doc.moveDown(0.6);
}

function bloque(doc, titulo, lineas) {
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#555').text(titulo);
  doc.fillColor('#000').font('Helvetica').fontSize(11);
  for (const l of lineas) doc.text(l);
}

module.exports = { generarPdf, tipoPorEstado };

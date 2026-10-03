const { pool } = require('../../db/pool');

/**
 * Panel de números del taller: lo que el dueño quiere mirar una vez por mes.
 * Mes actual contra mes anterior, con el facturado partido entre mano de obra
 * (la plata que realmente queda) y repuestos (los que pasan de largo).
 *
 * Las fechas se calculan en hora argentina (UTC-3, sin horario de verano) para
 * que "este mes" sea el mes del calendario del taller, no del servidor.
 */

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function toSql(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Devuelve inicio del mes actual, del mes anterior y del mes siguiente, en UTC. */
function ventanasMensualesAr(ahora = new Date()) {
  // "Hoy" según hora argentina
  const ahoraAr = new Date(ahora.getTime() - 3 * 3600 * 1000);
  const anio = ahoraAr.getUTCFullYear();
  const mes = ahoraAr.getUTCMonth();
  // Medianoche AR del día 1 del mes = 03:00 UTC
  const inicioActualUtc = new Date(Date.UTC(anio, mes, 1, 3, 0, 0));
  const inicioAnteriorUtc = new Date(Date.UTC(anio, mes - 1, 1, 3, 0, 0));
  const inicioSiguienteUtc = new Date(Date.UTC(anio, mes + 1, 1, 3, 0, 0));

  const etiqueta = (y, m) => `${MESES[((m % 12) + 12) % 12]} ${y + Math.floor(m / 12)}`;
  return {
    actual: { inicio: inicioActualUtc, fin: inicioSiguienteUtc, etiqueta: etiqueta(anio, mes) },
    anterior: { inicio: inicioAnteriorUtc, fin: inicioActualUtc, etiqueta: etiqueta(anio, mes - 1) },
  };
}

async function metricasDeMes(tallerId, inicio, fin) {
  const inicioSql = toSql(inicio);
  const finSql = toSql(fin);

  const [[ordenes]] = await pool.query(
    `SELECT COUNT(*) AS entregadas,
            COALESCE(SUM(total), 0) AS facturado,
            COUNT(DISTINCT cliente_id) AS clientes_atendidos
       FROM ordenes
      WHERE taller_id = ? AND estado = 'entregado'
        AND fecha_entrega >= ? AND fecha_entrega < ?`,
    [tallerId, inicioSql, finSql],
  );

  const [[items]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN tipo = 'mano_de_obra' THEN cantidad * precio_unitario END), 0) AS mano_obra,
            COALESCE(SUM(CASE WHEN tipo = 'repuesto' THEN cantidad * precio_unitario END), 0) AS repuestos,
            COALESCE(SUM(CASE WHEN tipo = 'otro' THEN cantidad * precio_unitario END), 0) AS otros
       FROM orden_items oi
       JOIN ordenes o ON o.id = oi.orden_id
      WHERE o.taller_id = ? AND o.estado = 'entregado'
        AND o.fecha_entrega >= ? AND o.fecha_entrega < ?`,
    [tallerId, inicioSql, finSql],
  );

  // Clientes del mes que ya habían venido alguna vez antes (al menos una orden no cancelada).
  const [[volvieron]] = await pool.query(
    `SELECT COUNT(DISTINCT o.cliente_id) AS volvieron
       FROM ordenes o
      WHERE o.taller_id = ? AND o.estado = 'entregado'
        AND o.fecha_entrega >= ? AND o.fecha_entrega < ?
        AND EXISTS (
          SELECT 1 FROM ordenes p
           WHERE p.taller_id = o.taller_id
             AND p.cliente_id = o.cliente_id
             AND p.id <> o.id
             AND p.estado <> 'cancelada'
             AND p.fecha_ingreso < ?
        )`,
    [tallerId, inicioSql, finSql, inicioSql],
  );

  const entregadas = Number(ordenes.entregadas);
  const facturado = Number(ordenes.facturado);
  return {
    entregadas,
    facturado: facturado.toFixed(2),
    facturado_mano_obra: Number(items.mano_obra).toFixed(2),
    facturado_repuestos: Number(items.repuestos).toFixed(2),
    facturado_otros: Number(items.otros).toFixed(2),
    ticket_promedio: entregadas > 0 ? (facturado / entregadas).toFixed(2) : '0.00',
    clientes_atendidos: Number(ordenes.clientes_atendidos),
    clientes_que_volvieron: Number(volvieron.volvieron),
  };
}

/**
 * Top de descripciones de mano de obra del mes actual. Se agrupan ignorando
 * mayúsculas y espacios para que "Cambio de aceite" y "cambio de aceite "
 * cuenten como el mismo trabajo.
 */
async function trabajosFrecuentes(tallerId, inicio, fin) {
  const [filas] = await pool.query(
    `SELECT ANY_VALUE(oi.descripcion) AS descripcion, COUNT(*) AS cantidad
       FROM orden_items oi
       JOIN ordenes o ON o.id = oi.orden_id
      WHERE o.taller_id = ? AND o.estado = 'entregado'
        AND o.fecha_entrega >= ? AND o.fecha_entrega < ?
        AND oi.tipo = 'mano_de_obra'
      GROUP BY LOWER(TRIM(oi.descripcion))
      ORDER BY cantidad DESC, descripcion
      LIMIT 5`,
    [tallerId, toSql(inicio), toSql(fin)],
  );
  return filas.map((f) => ({ descripcion: f.descripcion, cantidad: Number(f.cantidad) }));
}

async function panel(tallerId) {
  const { actual, anterior } = ventanasMensualesAr();
  const [datosActual, datosAnterior, frecuentes] = await Promise.all([
    metricasDeMes(tallerId, actual.inicio, actual.fin),
    metricasDeMes(tallerId, anterior.inicio, anterior.fin),
    trabajosFrecuentes(tallerId, actual.inicio, actual.fin),
  ]);
  return {
    mes_actual: { etiqueta: actual.etiqueta, ...datosActual },
    mes_anterior: { etiqueta: anterior.etiqueta, ...datosAnterior },
    trabajos_frecuentes: frecuentes,
  };
}

/**
 * Lista las órdenes entregadas en los últimos `dias` días (según hora argentina).
 * Pensado para seguir el día a día desde el panel: lo de hoy arriba del todo.
 */
async function entregasRecientes(tallerId, dias) {
  // "Hoy" en AR: medianoche AR del día de hoy, en UTC.
  const ahora = new Date();
  const ahoraAr = new Date(ahora.getTime() - 3 * 3600 * 1000);
  const inicioHoyAr = new Date(Date.UTC(ahoraAr.getUTCFullYear(), ahoraAr.getUTCMonth(), ahoraAr.getUTCDate(), 3, 0, 0));
  const desde = new Date(inicioHoyAr.getTime() - (dias - 1) * 86_400_000);

  const [filas] = await pool.query(
    `SELECT o.id, o.numero, o.total, o.fecha_entrega,
            v.patente, v.tipo, v.marca, v.modelo,
            c.nombre AS cliente_nombre
       FROM ordenes o
       JOIN vehiculos v ON v.id = o.vehiculo_id
       JOIN clientes c ON c.id = o.cliente_id
      WHERE o.taller_id = ? AND o.estado = 'entregado'
        AND o.fecha_entrega >= ?
      ORDER BY o.fecha_entrega DESC`,
    [tallerId, toSql(desde)],
  );

  return filas.map((f) => ({
    id: f.id,
    numero: f.numero,
    total: f.total,
    fecha_entrega: f.fecha_entrega,
    vehiculo: { patente: f.patente, tipo: f.tipo, marca: f.marca, modelo: f.modelo },
    cliente: { nombre: f.cliente_nombre },
  }));
}

module.exports = { panel, entregasRecientes, ventanasMensualesAr };

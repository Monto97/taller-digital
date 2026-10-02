const { pool } = require('../../db/pool');
const AppError = require('../../utils/AppError');
const authService = require('../auth/auth.service');

/**
 * Panel de admin: lo que pasa en TODOS los talleres. Es la única parte del
 * sistema que no filtra por taller_id, por eso solo se accede con requireAdmin.
 *
 * Las fechas "del día" se calculan en hora argentina (UTC-3, sin horario de verano).
 */
const HOY_AR = 'DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR)';

async function resumen() {
  const [[talleres]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(activo = 1) AS habilitados,
       SUM(created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY) AS nuevos_30d,
       -- Activo = movió alguna orden en los últimos 7 días
       SUM(EXISTS (
         SELECT 1 FROM ordenes o JOIN orden_eventos e ON e.orden_id = o.id
          WHERE o.taller_id = t.id AND e.created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
       )) AS activos_7d,
       -- Arrancaron = cargaron al menos una orden
       SUM(EXISTS (SELECT 1 FROM ordenes o WHERE o.taller_id = t.id)) AS con_ordenes
     FROM talleres t`,
  );

  const [[ordenes]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(fecha_ingreso >= UTC_TIMESTAMP() - INTERVAL 7 DAY) AS ultimos_7d,
       SUM(fecha_ingreso >= UTC_TIMESTAMP() - INTERVAL 30 DAY) AS ultimos_30d,
       SUM(estado = 'entregado') AS entregadas,
       COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total END), 0) AS monto_entregado,
       COALESCE(SUM(CASE WHEN estado = 'entregado' AND fecha_entrega >= UTC_TIMESTAMP() - INTERVAL 30 DAY THEN total END), 0)
         AS monto_entregado_30d,
       SUM(presupuesto_estado IN ('enviado', 'aprobado', 'rechazado')) AS presupuestos_enviados,
       SUM(presupuesto_estado = 'aprobado') AS presupuestos_aprobados,
       SUM(presupuesto_estado = 'rechazado') AS presupuestos_rechazados
     FROM ordenes`,
  );

  const [[eventos]] = await pool.query(
    `SELECT
       SUM(tipo = 'presupuesto_aprobado' AND usuario_id IS NULL) AS aprobados_por_link,
       SUM(tipo = 'aviso_whatsapp') AS avisos_whatsapp,
       SUM(tipo = 'aviso_whatsapp' AND created_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY) AS avisos_whatsapp_30d
     FROM orden_eventos`,
  );

  const [[base]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM vehiculos WHERE deleted_at IS NULL) AS vehiculos,
            (SELECT COUNT(*) FROM clientes WHERE deleted_at IS NULL) AS clientes,
            (SELECT COUNT(*) FROM usuarios WHERE activo = 1) AS usuarios`,
  );

  // Órdenes por día de los últimos 30 días, con los días sin órdenes en 0.
  const [porDia] = await pool.query(
    `SELECT DATE_FORMAT(DATE(fecha_ingreso - INTERVAL 3 HOUR), '%Y-%m-%d') AS dia, COUNT(*) AS ordenes
       FROM ordenes
      WHERE fecha_ingreso >= ${HOY_AR} - INTERVAL 29 DAY + INTERVAL 3 HOUR
      GROUP BY dia`,
  );
  const cantidades = new Map(porDia.map((f) => [f.dia, f.ordenes]));
  const [[{ hoy }]] = await pool.query(`SELECT DATE_FORMAT(${HOY_AR}, '%Y-%m-%d') AS hoy`);
  const serie = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(`${hoy}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const dia = d.toISOString().slice(0, 10);
    serie.push({ dia, ordenes: cantidades.get(dia) ?? 0 });
  }

  const n = (v) => Number(v ?? 0);
  return {
    talleres: {
      total: n(talleres.total),
      habilitados: n(talleres.habilitados),
      nuevos_30d: n(talleres.nuevos_30d),
      activos_7d: n(talleres.activos_7d),
      con_ordenes: n(talleres.con_ordenes),
    },
    ordenes: {
      total: n(ordenes.total),
      ultimos_7d: n(ordenes.ultimos_7d),
      ultimos_30d: n(ordenes.ultimos_30d),
      entregadas: n(ordenes.entregadas),
      monto_entregado: ordenes.monto_entregado,
      monto_entregado_30d: ordenes.monto_entregado_30d,
    },
    presupuestos: {
      enviados: n(ordenes.presupuestos_enviados),
      aprobados: n(ordenes.presupuestos_aprobados),
      rechazados: n(ordenes.presupuestos_rechazados),
      aprobados_por_link: n(eventos.aprobados_por_link),
    },
    whatsapp: { avisos: n(eventos.avisos_whatsapp), avisos_30d: n(eventos.avisos_whatsapp_30d) },
    base: { vehiculos: n(base.vehiculos), clientes: n(base.clientes), usuarios: n(base.usuarios) },
    ordenes_por_dia: serie,
  };
}

async function talleres() {
  const [filas] = await pool.query(
    `SELECT t.id, t.nombre, t.telefono, t.direccion, t.activo, t.created_at,
            (SELECT u.nombre FROM usuarios u WHERE u.taller_id = t.id AND u.rol = 'dueno' ORDER BY u.id LIMIT 1) AS dueno_nombre,
            (SELECT u.email FROM usuarios u WHERE u.taller_id = t.id AND u.rol = 'dueno' ORDER BY u.id LIMIT 1) AS dueno_email,
            (SELECT COUNT(*) FROM usuarios u WHERE u.taller_id = t.id AND u.activo = 1) AS usuarios,
            (SELECT MAX(u.ultimo_login_at) FROM usuarios u WHERE u.taller_id = t.id) AS ultimo_ingreso,
            (SELECT COUNT(*) FROM ordenes o WHERE o.taller_id = t.id) AS ordenes,
            (SELECT COUNT(*) FROM ordenes o WHERE o.taller_id = t.id AND o.fecha_ingreso >= UTC_TIMESTAMP() - INTERVAL 7 DAY) AS ordenes_7d,
            (SELECT COUNT(*) FROM ordenes o WHERE o.taller_id = t.id AND o.estado IN
               ('recibido', 'diagnostico', 'esperando_aprobacion', 'en_reparacion', 'listo')) AS en_taller,
            (SELECT COUNT(*) FROM vehiculos v WHERE v.taller_id = t.id AND v.deleted_at IS NULL) AS vehiculos,
            (SELECT COALESCE(SUM(o.total), 0) FROM ordenes o WHERE o.taller_id = t.id AND o.estado = 'entregado') AS monto_entregado,
            (SELECT MAX(e.created_at) FROM orden_eventos e JOIN ordenes o ON o.id = e.orden_id WHERE o.taller_id = t.id)
              AS ultima_actividad
       FROM talleres t
      ORDER BY t.created_at DESC`,
  );

  const ahora = Date.now();
  return filas.map((f) => {
    // Qué tan vivo está el taller según su última actividad con órdenes.
    const dias = f.ultima_actividad ? (ahora - new Date(f.ultima_actividad).getTime()) / 86_400_000 : null;
    let uso = 'sin_arrancar';
    if (dias !== null) uso = dias <= 3 ? 'activo' : dias <= 14 ? 'poco_uso' : 'inactivo';
    return { ...f, activo: Boolean(f.activo), uso };
  });
}

/** Alta de un taller desde el panel: reemplaza al curl con la clave de registro. */
async function crearTaller(datos) {
  const res = await authService.registro(datos);
  return { taller: res.taller, usuario: res.usuario };
}

async function cambiarHabilitado(id, activo) {
  const [res] = await pool.query('UPDATE talleres SET activo = ? WHERE id = ?', [activo ? 1 : 0, id]);
  if (res.affectedRows === 0) throw AppError.noEncontrado('El taller');
  return (await talleres()).find((t) => t.id === id);
}

module.exports = { resumen, talleres, crearTaller, cambiarHabilitado };

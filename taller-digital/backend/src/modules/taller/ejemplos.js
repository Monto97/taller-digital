const crypto = require('node:crypto');
const { withTransaction } = require('../../db/pool');
const { formatearPesos } = require('../../utils/formato');

/**
 * Datos de ejemplo que se cargan cuando un taller se registra solo, para que
 * no entre a un tablero vacío y vea cómo se usa cada estado.
 *
 * Todo cuelga de clientes con es_ejemplo = 1: sus vehículos y sus órdenes
 * (con ítems, eventos y pagos) se borran juntos desde el tablero.
 *
 * Los clientes de ejemplo llevan el WhatsApp del propio taller: si el dueño
 * prueba "Avisar por WhatsApp", el mensaje le llega a él y no a un extraño.
 */

const MO = 'mano_de_obra';

// horas: hace cuánto entró. Los estados recorren las columnas del tablero.
const EJEMPLOS = [
  {
    cliente: 'Carlos Benítez',
    vehiculo: { patente: 'AE418RT', tipo: 'auto', marca: 'Volkswagen', modelo: 'Gol Trend', km: 87400 },
    motivo: 'Service de 90.000 km: aceite y filtros',
    horas: 30,
    estado: 'listo',
    presupuesto: 'aprobado',
    items: [
      ['repuesto', 'Aceite sintético 5W30 (4 L)', 1, 48000],
      ['repuesto', 'Filtro de aceite', 1, 9500],
      ['repuesto', 'Filtro de aire', 1, 12800],
      [MO, 'Service completo', 1, 35000],
    ],
  },
  {
    cliente: 'Laura Giménez',
    vehiculo: { patente: 'AC902LM', tipo: 'auto', marca: 'Toyota', modelo: 'Etios', km: 62300 },
    motivo: 'Cambio de pastillas y discos de freno delanteros',
    horas: 26,
    estado: 'en_reparacion',
    presupuesto: 'aprobado',
    items: [
      ['repuesto', 'Pastillas de freno delanteras', 1, 62000],
      ['repuesto', 'Discos de freno delanteros', 2, 49000],
      [MO, 'Cambio de pastillas y discos', 1, 40000],
    ],
  },
  {
    cliente: 'Graciela López',
    vehiculo: { patente: 'AA561CZ', tipo: 'auto', marca: 'Renault', modelo: 'Sandero', km: 112500 },
    motivo: 'Patina el embrague en subida',
    diagnostico: 'Disco y placa de embrague gastados. Conviene cambiar el kit completo con rulemán.',
    horas: 20,
    estado: 'esperando_aprobacion',
    presupuesto: 'enviado',
    items: [
      ['repuesto', 'Kit de embrague con rulemán', 1, 210000],
      [MO, 'Cambio de embrague', 1, 95000],
    ],
  },
  {
    cliente: 'Martín Sosa',
    vehiculo: { patente: 'AF330NB', tipo: 'auto', marca: 'Ford', modelo: 'Ka', km: 41200 },
    motivo: 'Ruido en el tren delantero al pasar lomos de burro',
    horas: 3,
    estado: 'diagnostico',
    presupuesto: 'borrador',
    items: [],
  },
  {
    cliente: 'Lucas Romero',
    vehiculo: { patente: 'A058KLM', tipo: 'moto', marca: 'Honda', modelo: 'CB 190R', km: 15300 },
    motivo: 'Service: aceite, filtro y ajuste de cadena',
    horas: 28,
    estado: 'entregado',
    presupuesto: 'aprobado',
    pago: 'efectivo',
    items: [
      ['repuesto', 'Aceite 10W40 4T (1 L)', 1, 14000],
      ['repuesto', 'Filtro de aceite', 1, 6500],
      [MO, 'Service y ajuste de cadena', 1, 18000],
    ],
  },
];

const NOTA_CLIENTE = 'Cliente de ejemplo. Si probás avisarle por WhatsApp, el mensaje te llega a vos.';

/**
 * Carga los ejemplos dentro de la transacción del registro (conn ya abierta).
 * telefono: el del taller, ya normalizado (puede ser null).
 */
async function cargar(conn, tallerId, usuarioId, telefono) {
  const evento = (ordenId, tipo, horas, extra = {}) =>
    conn.query(
      `INSERT INTO orden_eventos (orden_id, usuario_id, tipo, estado_desde, estado_hasta, detalle, created_at)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP() - INTERVAL ? MINUTE)`,
      [ordenId, usuarioId, tipo, extra.desde ?? null, extra.hasta ?? null, extra.detalle ?? null, Math.round(horas * 60)],
    );

  let numero = 1;
  for (const e of EJEMPLOS) {
    const [cli] = await conn.query(
      'INSERT INTO clientes (taller_id, nombre, telefono, notas, es_ejemplo) VALUES (?, ?, ?, ?, 1)',
      [tallerId, e.cliente, telefono ?? null, NOTA_CLIENTE],
    );
    const v = e.vehiculo;
    const [veh] = await conn.query(
      `INSERT INTO vehiculos (taller_id, cliente_id, patente, tipo, marca, modelo, km_actual)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [tallerId, cli.insertId, v.patente, v.tipo, v.marca, v.modelo, v.km],
    );

    const total = e.items.reduce((s, [, , cant, precio]) => s + cant * precio, 0);
    const conPresupuesto = e.presupuesto !== 'borrador';
    const aprobado = e.presupuesto === 'aprobado';
    const entregado = e.estado === 'entregado';
    const [ord] = await conn.query(
      `INSERT INTO ordenes (taller_id, numero, vehiculo_id, cliente_id, mecanico_id, estado, motivo, diagnostico,
                            km_ingreso, presupuesto_estado, presupuesto_enviado_at, presupuesto_respondido_at,
                            total, token_publico, fecha_ingreso, fecha_entrega)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ${conPresupuesto ? 'UTC_TIMESTAMP() - INTERVAL ? MINUTE' : '?'},
               ${aprobado ? 'UTC_TIMESTAMP() - INTERVAL ? MINUTE' : '?'},
               ?, ?, UTC_TIMESTAMP() - INTERVAL ? MINUTE,
               ${entregado ? 'UTC_TIMESTAMP()' : 'NULL'})`,
      [
        tallerId, numero, veh.insertId, cli.insertId, usuarioId, e.estado, e.motivo, e.diagnostico ?? null,
        v.km, e.presupuesto,
        conPresupuesto ? Math.round((e.horas - 2) * 60) : null,
        aprobado ? Math.round((e.horas - 3) * 60) : null,
        total, crypto.randomBytes(16).toString('hex'), Math.round(e.horas * 60),
      ],
    );
    const ordenId = ord.insertId;
    numero += 1;

    for (const [i, [tipo, descripcion, cantidad, precio]] of e.items.entries()) {
      await conn.query(
        `INSERT INTO orden_items (orden_id, tipo, descripcion, cantidad, precio_unitario, posicion)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [ordenId, tipo, descripcion, cantidad, precio, i],
      );
    }

    // Línea de tiempo creíble: cada paso un poco después del anterior.
    const inicial = e.estado === 'diagnostico' ? 'diagnostico' : 'recibido';
    await evento(ordenId, 'creada', e.horas, { hasta: inicial });
    if (inicial === 'recibido') {
      await evento(ordenId, 'cambio_estado', e.horas - 1, { desde: 'recibido', hasta: 'diagnostico' });
    }
    if (conPresupuesto) {
      await evento(ordenId, 'presupuesto_enviado', e.horas - 2);
      await evento(ordenId, 'cambio_estado', e.horas - 2, { desde: 'diagnostico', hasta: 'esperando_aprobacion' });
    }
    if (aprobado) {
      await evento(ordenId, 'presupuesto_aprobado', e.horas - 3, { detalle: 'Aprobado por el taller' });
      await evento(ordenId, 'cambio_estado', e.horas - 3, { desde: 'esperando_aprobacion', hasta: 'en_reparacion' });
    }
    if (['listo', 'entregado'].includes(e.estado)) {
      await evento(ordenId, 'cambio_estado', e.horas - 6, { desde: 'en_reparacion', hasta: 'listo' });
    }
    if (e.pago) {
      await conn.query(
        `INSERT INTO orden_pagos (taller_id, orden_id, usuario_id, monto, medio, fecha)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
        [tallerId, ordenId, usuarioId, total, e.pago],
      );
      await evento(ordenId, 'pago_registrado', 0, { detalle: `Efectivo ${formatearPesos(total)}` });
    }
    if (entregado) {
      await evento(ordenId, 'cambio_estado', 0, { desde: 'listo', hasta: 'entregado' });
    }
  }

  await conn.query('UPDATE talleres SET proximo_numero_orden = ? WHERE id = ?', [numero, tallerId]);
}

/**
 * Borra los ejemplos del taller: órdenes (con ítems, eventos y pagos en cascada),
 * vehículos, services programados y clientes. Si no queda ninguna orden real,
 * la numeración vuelve a empezar en 1.
 */
async function borrar(tallerId) {
  return withTransaction(async (conn) => {
    const [clientes] = await conn.query(
      'SELECT id FROM clientes WHERE taller_id = ? AND es_ejemplo = 1 FOR UPDATE',
      [tallerId],
    );
    if (clientes.length === 0) return { borrados: 0 };
    const clienteIds = clientes.map((c) => c.id);

    const [vehiculos] = await conn.query(
      'SELECT id FROM vehiculos WHERE taller_id = ? AND cliente_id IN (?)',
      [tallerId, clienteIds],
    );
    const vehiculoIds = vehiculos.map((v) => v.id);
    const filtroVehiculos = vehiculoIds.length ? vehiculoIds : [0];

    const [ordenes] = await conn.query(
      'DELETE FROM ordenes WHERE taller_id = ? AND (cliente_id IN (?) OR vehiculo_id IN (?))',
      [tallerId, clienteIds, filtroVehiculos],
    );
    await conn.query('DELETE FROM servicios_programados WHERE taller_id = ? AND vehiculo_id IN (?)', [
      tallerId,
      filtroVehiculos,
    ]);
    await conn.query('DELETE FROM vehiculos WHERE taller_id = ? AND id IN (?)', [tallerId, filtroVehiculos]);
    await conn.query('DELETE FROM clientes WHERE taller_id = ? AND id IN (?)', [tallerId, clienteIds]);

    const [[{ quedan }]] = await conn.query('SELECT COUNT(*) AS quedan FROM ordenes WHERE taller_id = ?', [tallerId]);
    if (quedan === 0) {
      await conn.query('UPDATE talleres SET proximo_numero_orden = 1 WHERE id = ?', [tallerId]);
    }

    return { borrados: ordenes.affectedRows };
  });
}

module.exports = { cargar, borrar, EJEMPLOS };

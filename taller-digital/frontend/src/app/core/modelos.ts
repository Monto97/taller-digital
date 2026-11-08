/** Tipos que devuelve la API. Reflejan docs/API.md. */

export type EstadoOrden =
  | 'recibido'
  | 'diagnostico'
  | 'esperando_aprobacion'
  | 'en_reparacion'
  | 'listo'
  | 'entregado'
  | 'cancelada';

export type TipoVehiculo = 'auto' | 'moto';
export type TipoItem = 'repuesto' | 'mano_de_obra' | 'otro';
export type PlantillaWhatsapp = 'recibido' | 'presupuesto' | 'listo' | 'pdf';
export type MedioPago = 'efectivo' | 'transferencia' | 'mercado_pago' | 'tarjeta' | 'otro';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: 'dueno' | 'mecanico';
  /** true solo para los emails de ADMIN_EMAILS: ve el panel de admin. */
  admin?: boolean;
}

export interface Taller {
  id: number;
  nombre: string;
  slug: string;
}

/** Datos completos del taller, para la pantalla de Ajustes. */
export interface DatosTaller extends Taller {
  telefono: string | null;
  direccion: string | null;
  logo_url: string | null;
}

export interface Sesion {
  token: string;
  usuario: Usuario;
  taller: Taller;
}

export interface ClienteResumen {
  id: number;
  nombre: string;
  telefono: string | null;
}

export interface Vehiculo {
  id: number;
  patente: string;
  tipo: TipoVehiculo;
  marca: string | null;
  modelo: string | null;
  anio: number | null;
  color: string | null;
  km_actual: number | null;
  cliente: ClienteResumen;
  visitas: number;
  ultima_visita: string | null;
  orden_activa: { id: number; numero: number; estado: EstadoOrden } | null;
  proximo_servicio: { descripcion: string; fecha_estimada: string | null; km_estimado: number | null } | null;
}

export interface Item {
  id: number;
  tipo: TipoItem;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  subtotal: string;
}

export interface Evento {
  id: number;
  tipo:
    | 'creada'
    | 'cambio_estado'
    | 'presupuesto_enviado'
    | 'presupuesto_aprobado'
    | 'presupuesto_rechazado'
    | 'aviso_whatsapp'
    | 'nota'
    | 'pago_registrado'
    | 'pago_anulado';
  estado_desde: EstadoOrden | null;
  estado_hasta: EstadoOrden | null;
  detalle: string | null;
  created_at: string;
  usuario_nombre: string | null;
}

export interface Pago {
  id: number;
  monto: string;
  medio: MedioPago;
  medio_etiqueta: string;
  fecha: string;
  nota: string | null;
  usuario_nombre: string | null;
  anulada_at: string | null;
  anulada_motivo: string | null;
  anulada_por_nombre: string | null;
}

export interface Orden {
  id: number;
  numero: number;
  estado: EstadoOrden;
  estado_etiqueta: string;
  estados_siguientes: EstadoOrden[];
  motivo: string;
  diagnostico: string | null;
  km_ingreso: number | null;
  total: string;
  presupuesto: { estado: 'borrador' | 'enviado' | 'aprobado' | 'rechazado'; enviado_at: string | null; respondido_at: string | null };
  fecha_ingreso: string;
  fecha_estimada_entrega: string | null;
  fecha_entrega: string | null;
  link_publico: string;
  /** Links de WhatsApp listos por plantilla. null si el cliente no tiene celular. */
  whatsapp: Record<PlantillaWhatsapp, string> | null;
  vehiculo: { id: number; patente: string; tipo: TipoVehiculo; marca: string | null; modelo: string | null; anio: number | null; km_actual: number | null };
  cliente: ClienteResumen;
  mecanico: { id: number; nombre: string } | null;
  items: Item[];
  pagado: string;
  saldo: string;
  pagos: Pago[];
  eventos: Evento[];
  /** Solo viene en las respuestas de acciones que generan un aviso (crear, enviar presupuesto, pasar a listo). */
  whatsapp_url?: string | null;
}

export interface TarjetaTablero {
  id: number;
  numero: number;
  patente: string;
  tipo: TipoVehiculo;
  vehiculo: string | null;
  cliente: string;
  motivo: string;
  total: string;
  mecanico: { id: number; nombre: string } | null;
  fecha_ingreso: string;
  fecha_estimada_entrega: string | null;
  /** Auto cargado al registrarse para mostrar la app. */
  es_ejemplo: boolean;
}

export interface Tablero {
  resumen: { en_taller: number; listos: number; presupuestos_sin_respuesta: number; entregados_hoy: number };
  columnas: Record<'recibido' | 'diagnostico' | 'esperando_aprobacion' | 'en_reparacion' | 'listo', TarjetaTablero[]>;
  /** Quedan autos de ejemplo del registro (aunque estén entregados). */
  hay_ejemplos: boolean;
}

export interface OrdenHistorial {
  id: number;
  numero: number;
  estado: EstadoOrden;
  fecha_ingreso: string;
  km_ingreso: number | null;
  motivo: string;
  diagnostico: string | null;
  total: string;
  mecanico: string | null;
  items: Omit<Item, 'subtotal'>[];
}

/** Lo que ve el cliente desde el link de WhatsApp (GET /publico/ordenes/:token). */
export interface OrdenPublica {
  taller: { nombre: string; telefono: string | null; direccion: string | null; logo_url: string | null };
  cliente: { nombre: string };
  orden: {
    numero: number;
    estado: EstadoOrden;
    estado_etiqueta: string;
    motivo: string;
    fecha_ingreso: string;
    fecha_estimada_entrega: string | null;
    fecha_entrega: string | null;
  };
  vehiculo: { patente: string; tipo: TipoVehiculo; marca: string | null; modelo: string | null };
  presupuesto: {
    estado: 'enviado' | 'aprobado' | 'rechazado';
    total: string;
    enviado_at: string | null;
    respondido_at: string | null;
    items: { tipo: TipoItem; descripcion: string; cantidad: string; precio_unitario: string; subtotal: string }[];
  } | null;
  pago: {
    total: string;
    pagado: string;
    saldo: string;
    /** true si el taller tiene conectada su cuenta de Mercado Pago. */
    mp_disponible: boolean;
  } | null;
  linea_de_tiempo: { estado: EstadoOrden; fecha: string }[];
}

// ---------- Panel de números del taller ----------

export interface MetricasMes {
  etiqueta: string;
  entregadas: number;
  facturado: string;
  facturado_mano_obra: string;
  facturado_repuestos: string;
  facturado_otros: string;
  ticket_promedio: string;
  clientes_atendidos: number;
  clientes_que_volvieron: number;
}

export interface PanelNumeros {
  mes_actual: MetricasMes;
  mes_anterior: MetricasMes;
  trabajos_frecuentes: { descripcion: string; cantidad: number }[];
}

export interface EntregaReciente {
  id: number;
  numero: number;
  total: string;
  fecha_entrega: string;
  vehiculo: { patente: string; tipo: TipoVehiculo; marca: string | null; modelo: string | null };
  cliente: { nombre: string };
}

// ---------- Panel de admin ----------

export interface AdminResumen {
  talleres: { total: number; habilitados: number; nuevos_30d: number; activos_7d: number; con_ordenes: number };
  ordenes: {
    total: number; ultimos_7d: number; ultimos_30d: number; entregadas: number;
    monto_entregado: string; monto_entregado_30d: string;
  };
  presupuestos: { enviados: number; aprobados: number; rechazados: number; aprobados_por_link: number };
  whatsapp: { avisos: number; avisos_30d: number };
  base: { vehiculos: number; clientes: number; usuarios: number };
  ordenes_por_dia: { dia: string; ordenes: number }[];
}

export type UsoTaller = 'activo' | 'poco_uso' | 'inactivo' | 'sin_arrancar';

export interface AdminTaller {
  id: number;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  created_at: string;
  dueno_nombre: string | null;
  dueno_email: string | null;
  usuarios: number;
  ultimo_ingreso: string | null;
  ordenes: number;
  ordenes_7d: number;
  en_taller: number;
  vehiculos: number;
  monto_entregado: string;
  ultima_actividad: string | null;
  uso: UsoTaller;
}

// ---------- Mercado Pago ----------

export interface MpEstado {
  /** false si el servidor todavía no tiene las credenciales de la app MP. */
  configurado: boolean;
  conectado: boolean;
  mp_user_id?: string;
  /** false si el taller conectó con credenciales de prueba (sandbox). */
  live_mode?: boolean;
  conectado_at?: string;
  expires_at?: string | null;
}

export interface ErrorApi {
  codigo: string;
  mensaje: string;
  detalles?: Record<string, string | number>;
}

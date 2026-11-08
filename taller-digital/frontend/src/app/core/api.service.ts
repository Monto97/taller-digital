import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AdminResumen, AdminTaller, ClienteResumen, DatosTaller, EntregaReciente, ErrorApi, EstadoOrden, MedioPago, MpEstado, Orden, OrdenHistorial, OrdenPublica, PanelNumeros, PlantillaWhatsapp, Sesion, Tablero, TipoItem, TipoVehiculo, Vehiculo,
} from './modelos';

/** En desarrollo el proxy de Angular manda /api al backend (ver proxy.conf.json). */
export const API_URL = '/api';

export interface DatosNuevoVehiculo {
  patente: string;
  tipo: TipoVehiculo;
  marca?: string;
  modelo?: string;
  cliente_id?: number;
  cliente?: { nombre: string; telefono?: string };
  formato_libre?: boolean;
}

export interface DatosRegistro {
  taller: { nombre: string; telefono?: string; direccion?: string };
  usuario: { nombre: string; email: string; password: string };
  /** Carga autos de ejemplo para no arrancar con el tablero vacío. */
  con_ejemplos?: boolean;
}

export interface DatosNuevaOrden {
  vehiculo_id?: number;
  vehiculo?: DatosNuevoVehiculo;
  motivo: string;
  km_ingreso?: number | null;
  /** 'en_reparacion' si el trabajo ya está claro, 'diagnostico' si hay que revisarlo. */
  estado_inicial?: EstadoOrden;
}

export interface DatosEditarVehiculo {
  patente?: string;
  tipo?: TipoVehiculo;
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
  km_actual?: number | null;
  cliente_id?: number;
  formato_libre?: boolean;
}

export interface DatosEditarCliente {
  nombre?: string;
  telefono?: string | null;
}

export interface DatosNuevoCliente {
  nombre: string;
  telefono?: string | null;
}

export interface DatosItem {
  tipo: TipoItem;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

export interface DatosPago {
  monto: number;
  medio: MedioPago;
  fecha?: string;
  nota?: string | null;
}

/**
 * Todas las llamadas devuelven Promise para usarlas con async/await en los
 * componentes. Los errores de la API se convierten en ErrorApi (ver errorDe).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  private get<T>(url: string) {
    return firstValueFrom(this.http.get<T>(`${API_URL}${url}`));
  }
  private post<T>(url: string, body: unknown = {}) {
    return firstValueFrom(this.http.post<T>(`${API_URL}${url}`, body));
  }
  private patch<T>(url: string, body: unknown) {
    return firstValueFrom(this.http.patch<T>(`${API_URL}${url}`, body));
  }
  private delete<T>(url: string) {
    return firstValueFrom(this.http.delete<T>(`${API_URL}${url}`));
  }

  // Auth
  login(email: string, password: string) {
    return this.post<Sesion>('/auth/login', { email, password });
  }
  registro(datos: DatosRegistro) {
    return this.post<Sesion>('/auth/registro', datos);
  }

  // Vehículos
  vehiculoPorPatente(patente: string) {
    return this.get<Vehiculo>(`/vehiculos/patente/${encodeURIComponent(patente)}`);
  }
  vehiculo(id: number) {
    return this.get<Vehiculo>(`/vehiculos/${id}`);
  }
  historial(id: number) {
    return this.get<{ vehiculo: Vehiculo; ordenes: OrdenHistorial[] }>(`/vehiculos/${id}/historial`);
  }
  editarVehiculo(id: number, datos: DatosEditarVehiculo) {
    return this.patch<Vehiculo>(`/vehiculos/${id}`, datos);
  }

  // Clientes
  buscarClientes(q: string) {
    return this.get<{ datos: ClienteResumen[]; paginacion: { pagina: number; por_pagina: number; total: number } }>(
      `/clientes?q=${encodeURIComponent(q)}&por_pagina=10`,
    );
  }
  crearCliente(datos: DatosNuevoCliente) {
    return this.post<ClienteResumen>('/clientes', datos);
  }
  editarCliente(id: number, datos: DatosEditarCliente) {
    return this.patch<ClienteResumen>(`/clientes/${id}`, datos);
  }

  // Órdenes
  tablero() {
    return this.get<Tablero>('/tablero');
  }
  /** Borra los autos de ejemplo del registro (solo el dueño). */
  borrarEjemplos() {
    return this.delete<{ borrados: number }>('/taller/ejemplos');
  }
  numeros() {
    return this.get<PanelNumeros>('/numeros');
  }
  entregasRecientes(dias = 7) {
    return this.get<EntregaReciente[]>(`/numeros/entregas?dias=${dias}`);
  }
  orden(id: number) {
    return this.get<Orden>(`/ordenes/${id}`);
  }
  crearOrden(datos: DatosNuevaOrden) {
    return this.post<Orden>('/ordenes', datos);
  }
  editarOrden(id: number, datos: { diagnostico?: string | null; km_ingreso?: number | null; motivo?: string }) {
    return this.patch<Orden>(`/ordenes/${id}`, datos);
  }
  cambiarEstado(id: number, estado: EstadoOrden, opciones: { confirmar_saldo_pendiente?: boolean } = {}) {
    return this.post<Orden>(`/ordenes/${id}/estado`, { estado, ...opciones });
  }
  registrarPago(id: number, datos: DatosPago) {
    return this.post<Orden>(`/ordenes/${id}/pagos`, datos);
  }
  anularPago(id: number, pagoId: number, motivo?: string) {
    return firstValueFrom(
      this.http.request<Orden>('delete', `${API_URL}/ordenes/${id}/pagos/${pagoId}`, {
        body: motivo ? { motivo } : {},
      }),
    );
  }
  agregarNota(id: number, detalle: string) {
    return this.post<Orden>(`/ordenes/${id}/notas`, { detalle });
  }
  agregarItem(id: number, item: DatosItem) {
    return this.post<Orden>(`/ordenes/${id}/items`, item);
  }
  eliminarItem(id: number, itemId: number) {
    return this.delete<Orden>(`/ordenes/${id}/items/${itemId}`);
  }
  enviarPresupuesto(id: number) {
    return this.post<Orden>(`/ordenes/${id}/presupuesto/enviar`);
  }
  linkWhatsapp(id: number, plantilla: PlantillaWhatsapp) {
    return this.get<{ whatsapp_url: string; mensaje: string }>(`/ordenes/${id}/whatsapp?plantilla=${plantilla}`);
  }
  registrarAviso(id: number, plantilla: PlantillaWhatsapp) {
    return this.post<void>(`/ordenes/${id}/whatsapp/registrar`, { plantilla });
  }
  /** Descarga el comprobante en PDF (el interceptor pone el token). */
  pdfOrden(id: number, tipo?: 'presupuesto' | 'comprobante') {
    const q = tipo ? `?tipo=${tipo}` : '';
    return firstValueFrom(this.http.get(`${API_URL}/ordenes/${id}/pdf${q}`, { responseType: 'blob' }));
  }

  // Panel de admin (solo ADMIN_EMAILS)
  adminResumen() {
    return this.get<AdminResumen>('/admin/resumen');
  }
  adminTalleres() {
    return this.get<AdminTaller[]>('/admin/talleres');
  }
  adminCrearTaller(datos: {
    taller: { nombre: string; telefono?: string; direccion?: string };
    usuario: { nombre: string; email: string; password: string };
  }) {
    return this.post<{ taller: { id: number; nombre: string }; usuario: { email: string } }>('/admin/talleres', datos);
  }
  adminHabilitar(id: number, activo: boolean) {
    return this.patch<AdminTaller>(`/admin/talleres/${id}`, { activo });
  }

  // Datos del propio taller (Ajustes)
  taller() {
    return this.get<DatosTaller>('/taller');
  }
  editarTaller(datos: { nombre?: string; telefono?: string | null; direccion?: string | null }) {
    return this.patch<DatosTaller>('/taller', datos);
  }

  // Mercado Pago
  mpEstado() {
    return this.get<MpEstado>('/mp/estado');
  }
  mpUrl() {
    return this.get<{ url: string }>('/mp/url');
  }
  mpDesconectar() {
    return this.delete<{ desconectado: boolean }>('/mp/conexion');
  }

  // Público (link del cliente, sin login)
  ordenPublica(token: string) {
    return this.get<OrdenPublica>(`/publico/ordenes/${token}`);
  }
  aprobarPresupuesto(token: string) {
    return this.post<OrdenPublica>(`/publico/ordenes/${token}/aprobar`);
  }
  rechazarPresupuesto(token: string, motivo: string) {
    return this.post<OrdenPublica>(`/publico/ordenes/${token}/rechazar`, { motivo });
  }
}

/** Convierte cualquier error en el formato de la API, con un mensaje entendible. */
export function errorDe(err: unknown): ErrorApi {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return { codigo: 'SIN_CONEXION', mensaje: 'No hay conexión con el sistema. Revisá internet y probá de nuevo.' };
    }
    const cuerpo = err.error as { error?: ErrorApi } | null;
    if (cuerpo?.error?.mensaje) return cuerpo.error;
  }
  return { codigo: 'DESCONOCIDO', mensaje: 'Algo salió mal. Probá de nuevo en un momento.' };
}

/** Abre WhatsApp con el mensaje armado. En el celular abre la app directamente. */
export function abrirWhatsapp(url: string) {
  window.open(url, '_blank', 'noopener');
}

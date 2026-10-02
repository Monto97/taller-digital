import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ErrorApi, EstadoOrden, Orden, OrdenHistorial, OrdenPublica, PlantillaWhatsapp, Sesion, Tablero, TipoItem, TipoVehiculo, Vehiculo,
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

export interface DatosNuevaOrden {
  vehiculo_id?: number;
  vehiculo?: DatosNuevoVehiculo;
  motivo: string;
  km_ingreso?: number | null;
}

export interface DatosItem {
  tipo: TipoItem;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
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

  // Órdenes
  tablero() {
    return this.get<Tablero>('/tablero');
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
  cambiarEstado(id: number, estado: EstadoOrden) {
    return this.post<Orden>(`/ordenes/${id}/estado`, { estado });
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

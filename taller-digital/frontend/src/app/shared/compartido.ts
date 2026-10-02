import { Component, Pipe, PipeTransform, computed, input } from '@angular/core';
import { EstadoOrden, TipoVehiculo } from '../core/modelos';

/** "AE482KT" -> "AE 482 KT", "ABC123" -> "ABC 123", "A057JKR" -> "A057 JKR" */
export function formatearPatente(p: string): string {
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p)) return `${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5)}`;
  if (/^[A-Z]{3}\d{3}$/.test(p) || /^\d{3}[A-Z]{3}$/.test(p)) return `${p.slice(0, 3)} ${p.slice(3)}`;
  if (/^[A-Z]\d{3}[A-Z]{3}$/.test(p)) return `${p.slice(0, 4)} ${p.slice(4)}`;
  return p;
}

/** "Fiat Cronos", o "Auto"/"Moto" si no tiene marca ni modelo cargados. */
export function nombreVehiculo(v: { marca: string | null; modelo: string | null; tipo: TipoVehiculo }): string {
  return [v.marca, v.modelo].filter(Boolean).join(' ') || (v.tipo === 'moto' ? 'Moto' : 'Auto');
}

export function normalizarPatente(valor: string): string {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * La patente como una chapa argentina: franja azul arriba y letras grandes.
 * Es el elemento que identifica cada vehículo en todo el sistema.
 */
@Component({
  selector: 'app-patente',
  template: `
    <span class="placa" [class.moto]="tipo() === 'moto'" [class.grande]="grande()">
      <span class="franja">{{ tipo() === 'moto' ? 'ARGENTINA' : 'REPÚBLICA ARGENTINA' }}</span>
      <span class="letras">{{ texto() }}</span>
    </span>
  `,
  styles: `
    :host { display: inline-flex; }
    .placa {
      display: inline-flex; flex-direction: column; overflow: hidden;
      min-width: 92px; border: 1.5px solid var(--grafito); border-radius: 4px; background: #fff;
    }
    .franja {
      background: var(--placa-azul); color: #fff; text-align: center;
      font: 600 6.5px/10px var(--fuente); letter-spacing: .3px;
    }
    .letras {
      padding: 0 8px; text-align: center; white-space: nowrap;
      font: 700 16px/22px var(--fuente-angosta); letter-spacing: 1px; color: var(--grafito);
    }
    .moto { min-width: 72px; }
    .moto .letras { font-size: 14px; line-height: 19px; }
    .grande { min-width: 180px; border-width: 2.5px; border-radius: 7px; }
    .grande .franja { font-size: 10px; line-height: 16px; letter-spacing: .5px; }
    .grande .letras { font-size: 34px; line-height: 46px; letter-spacing: 3px; padding: 0 16px; }
  `,
})
export class Patente {
  valor = input.required<string>();
  tipo = input<TipoVehiculo>('auto');
  grande = input(false);
  texto = computed(() => formatearPatente(this.valor()));
}

const FORMATO_PESOS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

/** "486000.00" -> "$ 486.000" */
@Pipe({ name: 'pesos' })
export class PesosPipe implements PipeTransform {
  transform(valor: string | number | null | undefined): string {
    if (valor == null || valor === '') return '';
    return FORMATO_PESOS.format(Number(valor)).replace(/\u00a0/g, ' ');
  }
}

/** "12" -> "12", "1.50" -> "1,5" (cantidades sin decimales de más) */
@Pipe({ name: 'cantidad' })
export class CantidadPipe implements PipeTransform {
  transform(valor: string | number): string {
    return Number(valor).toLocaleString('es-AR', { maximumFractionDigits: 2 });
  }
}

/** 87450 -> "87.450 km" */
@Pipe({ name: 'km' })
export class KmPipe implements PipeTransform {
  transform(valor: number | null | undefined): string {
    return valor == null ? '' : `${valor.toLocaleString('es-AR')} km`;
  }
}

/** Fecha en lenguaje simple: "hoy 14:20", "ayer 9:05", "lun 13 oct". */
@Pipe({ name: 'cuando' })
export class CuandoPipe implements PipeTransform {
  transform(valor: string | null | undefined, conHora = true): string {
    if (!valor) return '';
    const fecha = new Date(valor);
    const hoy = new Date();
    const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diferencia = Math.round((dia(hoy) - dia(fecha)) / 86_400_000);
    const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

    if (diferencia === 0) return conHora ? `hoy ${hora}` : 'hoy';
    if (diferencia === 1) return conHora ? `ayer ${hora}` : 'ayer';
    const opciones: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
    if (fecha.getFullYear() !== hoy.getFullYear()) opciones.year = 'numeric';
    return fecha.toLocaleDateString('es-AR', opciones).replace(/,/g, '');
  }
}

export const ETIQUETA_ESTADO: Record<EstadoOrden, string> = {
  recibido: 'Recibido',
  diagnostico: 'En diagnóstico',
  esperando_aprobacion: 'Esperando aprobación',
  en_reparacion: 'En reparación',
  listo: 'Listo para retirar',
  entregado: 'Entregado',
  cancelada: 'Cancelada',
};

/** Texto del botón para pasar a cada estado, según desde dónde se pasa. */
export function textoAccion(desde: EstadoOrden, hasta: EstadoOrden): string {
  switch (hasta) {
    case 'diagnostico':
      return desde === 'esperando_aprobacion' ? 'Volver a diagnóstico' : 'Empezar diagnóstico';
    case 'en_reparacion':
      if (desde === 'esperando_aprobacion') return 'El cliente aprobó: empezar reparación';
      if (desde === 'listo') return 'Volver a reparación';
      return 'Empezar reparación';
    case 'listo':
      return 'Marcar como listo';
    case 'entregado':
      return 'Entregar al cliente';
    case 'cancelada':
      return 'Cancelar orden';
    default:
      return ETIQUETA_ESTADO[hasta];
  }
}

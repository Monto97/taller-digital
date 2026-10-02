import { Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, errorDe } from '../../core/api.service';
import { OrdenHistorial, Vehiculo } from '../../core/modelos';
import { CantidadPipe, CuandoPipe, ETIQUETA_ESTADO, KmPipe, Patente, PesosPipe, nombreVehiculo } from '../../shared/compartido';

@Component({
  selector: 'app-vehiculo',
  imports: [RouterLink, Patente, PesosPipe, CantidadPipe, CuandoPipe, KmPipe],
  template: `
    <div class="contenedor">
      @if (vehiculo(); as v) {
        <a routerLink="/" class="volver">Volver al tablero</a>

        <div class="grilla">
          <section class="panel ficha">
            <app-patente [valor]="v.patente" [tipo]="v.tipo" [grande]="true" />
            <h1>{{ nombre(v) }}</h1>
            <dl>
              <dt>Dueño</dt><dd>{{ v.cliente.nombre }}</dd>
              @if (v.km_actual) { <dt>Kilómetros</dt><dd>{{ v.km_actual | km }}</dd> }
              @if (v.anio) { <dt>Año</dt><dd>{{ v.anio }}</dd> }
              <dt>Visitas</dt><dd>{{ v.visitas }}</dd>
            </dl>

            @if (v.orden_activa) {
              <a [routerLink]="['/ordenes', v.orden_activa.id]" class="btn btn-oscuro btn-ancho">
                Ver la orden en curso
              </a>
            } @else {
              <a routerLink="/recibir" [queryParams]="{ patente: v.patente }" class="btn btn-primario btn-ancho">Recibir este vehículo</a>
            }
          </section>

          <section class="panel" aria-labelledby="t-historial">
            <h2 id="t-historial">Todo lo que se le hizo</h2>
            @for (o of ordenes(); track o.id) {
              <article class="visita">
                <div class="fecha">
                  <strong>{{ o.fecha_ingreso | cuando: false }}</strong>
                  @if (o.km_ingreso) { <span class="suave">{{ o.km_ingreso | km }}</span> }
                </div>
                <div class="trabajo">
                  <a [routerLink]="['/ordenes', o.id]" class="motivo">{{ o.motivo }}</a>
                  @if (o.estado !== 'entregado') {
                    <span class="estado estado-{{ o.estado }}">{{ etiqueta[o.estado] }}</span>
                  }
                  @if (o.items.length) {
                    <ul>
                      @for (i of o.items; track i.id) {
                        <li>{{ i.descripcion }}@if (+i.cantidad !== 1) { ({{ i.cantidad | cantidad }}) }</li>
                      }
                    </ul>
                  }
                </div>
                <span class="monto">{{ o.total | pesos }}</span>
              </article>
            } @empty {
              <p class="suave">Todavía no tiene trabajos registrados.</p>
            }
          </section>
        </div>
      } @else if (error()) {
        <p class="aviso aviso-error" role="alert">{{ error() }}</p>
      } @else {
        <p class="cargando">Cargando…</p>
      }
    </div>
  `,
  styles: `
    .volver { display: inline-block; margin-bottom: 14px; font-weight: 500; }
    .grilla { display: grid; gap: 14px; }
    @media (min-width: 900px) { .grilla { grid-template-columns: 340px minmax(0, 1fr); align-items: start; } }
    .grilla .panel + .panel { margin-top: 0; }
    .ficha { display: flex; flex-direction: column; gap: 14px; align-items: flex-start; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 0; }
    dt { color: var(--texto-suave); }
    dd { margin: 0; font-weight: 500; }
    h2 { margin-bottom: 8px; }
    .visita {
      display: grid; grid-template-columns: 110px 1fr auto; gap: 14px;
      padding: 14px 0; border-top: 1px solid var(--linea);
    }
    .visita:first-of-type { border-top: 0; }
    .fecha { display: flex; flex-direction: column; font-size: .92rem; }
    .trabajo { display: flex; flex-direction: column; gap: 4px; }
    .motivo { font-weight: 600; color: var(--texto); }
    ul { margin: 2px 0 0; padding-left: 18px; color: var(--texto-suave); font-size: .92rem; }
    .monto { font: 700 1.05rem var(--fuente-angosta); white-space: nowrap; }
    @media (max-width: 560px) {
      .visita { grid-template-columns: 1fr auto; }
      .fecha { grid-column: 1 / -1; flex-direction: row; gap: 10px; }
    }
  `,
})
export class VehiculoPagina implements OnInit {
  private api = inject(ApiService);
  readonly nombre = nombreVehiculo;

  id = input.required<string>();
  vehiculo = signal<Vehiculo | null>(null);
  ordenes = signal<OrdenHistorial[]>([]);
  error = signal('');
  readonly etiqueta = ETIQUETA_ESTADO;

  async ngOnInit() {
    try {
      const id = Number(this.id());
      const [vehiculo, historial] = await Promise.all([this.api.vehiculo(id), this.api.historial(id)]);
      this.vehiculo.set(vehiculo);
      this.ordenes.set(historial.ordenes);
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    }
  }
}

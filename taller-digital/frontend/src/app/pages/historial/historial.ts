import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, errorDe } from '../../core/api.service';
import { EntregaReciente } from '../../core/modelos';
import { CuandoPipe, Patente, PesosPipe, nombreVehiculo } from '../../shared/compartido';

interface GrupoDia {
  etiqueta: string;
  entregas: EntregaReciente[];
  total: number;
}

const OPCIONES: { valor: number; texto: string }[] = [
  { valor: 1, texto: 'Hoy' },
  { valor: 7, texto: '7 días' },
  { valor: 30, texto: '30 días' },
];

/**
 * Historial de trabajos entregados. Pensado para ir mirando a lo largo del día:
 * lo de hoy arriba y los días previos abajo, agrupados.
 */
@Component({
  selector: 'app-historial',
  imports: [RouterLink, Patente, PesosPipe, CuandoPipe],
  template: `
    <div class="contenedor">
      <header class="encabezado">
        <h1>Historial de entregas</h1>
        <div class="opciones" role="group" aria-label="Rango">
          @for (o of opciones; track o.valor) {
            <button type="button" class="opcion" [attr.aria-pressed]="dias() === o.valor" (click)="cambiar(o.valor)">
              {{ o.texto }}
            </button>
          }
        </div>
      </header>

      @if (error()) {
        <p class="aviso aviso-error" role="alert">{{ error() }}</p>
      } @else if (gruposEntregas(); as grupos) {
        @if (grupos.length === 0) {
          <div class="panel vacio">
            <p class="suave">Todavía no hay entregas en este rango.</p>
          </div>
        } @else {
          <section class="panel pila">
            @for (g of grupos; track g.etiqueta) {
              <div class="dia">
                <div class="dia-titulo">
                  <h2>{{ g.etiqueta }}</h2>
                  <span class="suave">
                    {{ g.entregas.length }} {{ g.entregas.length === 1 ? 'entrega' : 'entregas' }}
                    · {{ g.total | pesos }}
                  </span>
                </div>
                <ul class="entregas">
                  @for (e of g.entregas; track e.id) {
                    <li>
                      <a [routerLink]="['/ordenes', e.id]" class="entrega">
                        <app-patente [valor]="e.vehiculo.patente" [tipo]="e.vehiculo.tipo" />
                        <div class="datos">
                          <span class="veh">{{ nombreVeh(e) }}</span>
                          <span class="suave">{{ e.cliente.nombre }} · n.º {{ e.numero }}</span>
                        </div>
                        <div class="meta">
                          <span class="monto">{{ e.total | pesos }}</span>
                          <span class="suave hora">{{ e.fecha_entrega | cuando }}</span>
                        </div>
                      </a>
                    </li>
                  }
                </ul>
              </div>
            }
          </section>
        }
      } @else {
        <p class="cargando">Cargando entregas…</p>
      }
    </div>
  `,
  styles: `
    .encabezado { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
    .opciones { display: flex; gap: 6px; flex-wrap: wrap; }
    .opcion {
      min-height: 40px; padding: 0 14px;
      border: 1.5px solid var(--linea); border-radius: var(--radio); background: var(--superficie);
      font: 600 .95rem var(--fuente); color: var(--texto); cursor: pointer;
    }
    .opcion[aria-pressed='true'] { border-color: var(--grafito); background: var(--grafito); color: #fff; }

    .pila { display: flex; flex-direction: column; gap: 14px; }
    .vacio { text-align: center; padding: 32px 20px; }

    .dia + .dia { margin-top: 6px; padding-top: 14px; border-top: 1px solid var(--linea); }
    .dia-titulo { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
    .dia-titulo h2 { font-size: 1.05rem; font-weight: 700; }
    .entregas { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .entrega {
      display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px;
      padding: 8px 10px; border-radius: var(--radio); color: var(--texto); text-decoration: none;
      background: var(--superficie); border: 1px solid var(--linea);
    }
    .entrega:hover { border-color: var(--gris); background: var(--fondo); }
    .datos { display: flex; flex-direction: column; min-width: 0; }
    .veh { font-weight: 600; }
    .meta { display: flex; flex-direction: column; align-items: flex-end; }
    .monto { font: 700 1.05rem var(--fuente-angosta); }
    .hora { font-size: .85rem; }
    @media (max-width: 560px) {
      .entrega { grid-template-columns: auto 1fr; }
      .meta { grid-column: 1 / -1; align-items: flex-start; flex-direction: row; gap: 10px; }
    }
  `,
})
export class HistorialPagina implements OnInit {
  private api = inject(ApiService);
  readonly nombreVeh = (e: EntregaReciente) => nombreVehiculo(e.vehiculo);
  readonly opciones = OPCIONES;

  dias = signal(7);
  entregas = signal<EntregaReciente[] | null>(null);
  error = signal('');

  gruposEntregas = computed<GrupoDia[] | null>(() => {
    const lista = this.entregas();
    if (!lista) return null;
    const grupos = new Map<string, GrupoDia>();
    for (const e of lista) {
      const clave = this.claveDiaAr(e.fecha_entrega);
      if (!grupos.has(clave)) {
        grupos.set(clave, { etiqueta: this.etiquetaDia(clave), entregas: [], total: 0 });
      }
      const g = grupos.get(clave)!;
      g.entregas.push(e);
      g.total += Number(e.total);
    }
    return [...grupos.values()];
  });

  async ngOnInit() {
    this.cargar();
  }

  async cambiar(dias: number) {
    this.dias.set(dias);
    this.entregas.set(null);
    await this.cargar();
  }

  private async cargar() {
    try {
      this.entregas.set(await this.api.entregasRecientes(this.dias()));
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    }
  }

  private claveDiaAr(iso: string): string {
    const d = new Date(iso);
    const ar = new Date(d.getTime() - 3 * 3600 * 1000);
    return ar.toISOString().slice(0, 10);
  }

  private etiquetaDia(clave: string): string {
    const ahoraAr = new Date(Date.now() - 3 * 3600 * 1000);
    const hoy = ahoraAr.toISOString().slice(0, 10);
    const ayer = new Date(ahoraAr.getTime() - 86_400_000).toISOString().slice(0, 10);
    if (clave === hoy) return 'Hoy';
    if (clave === ayer) return 'Ayer';
    const fecha = new Date(`${clave}T12:00:00Z`);
    const opciones: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' };
    const texto = fecha.toLocaleDateString('es-AR', opciones).replace(/,/g, '');
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }
}

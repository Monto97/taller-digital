import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiService, errorDe } from '../../core/api.service';
import { PanelNumeros } from '../../core/modelos';
import { PesosPipe } from '../../shared/compartido';

interface Delta {
  texto: string;
  signo: 'sube' | 'baja' | 'igual';
}

@Component({
  selector: 'app-numeros',
  imports: [PesosPipe],
  template: `
    <div class="contenedor">
      <header class="encabezado">
        <h1>Números del taller</h1>
        @if (panel(); as p) {
          <p class="suave">Comparando {{ p.mes_actual.etiqueta }} con {{ p.mes_anterior.etiqueta }}.</p>
        }
      </header>

      @if (error()) {
        <p class="aviso aviso-error" role="alert">{{ error() }}</p>
      } @else if (!panel()) {
        <p class="cargando">Cargando los números…</p>
      } @else if (panel(); as p) {
        <section class="tarjetas" aria-label="Resumen del mes">
          <article class="tarjeta destacada">
            <span class="etiqueta">Trabajos entregados</span>
            <span class="valor">{{ p.mes_actual.entregadas }}</span>
            <span class="comparacion {{ deltaEntregadas().signo }}">
              {{ deltaEntregadas().texto }} vs {{ p.mes_anterior.etiqueta }}
            </span>
          </article>

          <article class="tarjeta destacada">
            <span class="etiqueta">Facturado total</span>
            <span class="valor">{{ p.mes_actual.facturado | pesos }}</span>
            <span class="comparacion {{ deltaFacturado().signo }}">
              {{ deltaFacturado().texto }} vs {{ p.mes_anterior.etiqueta }}
            </span>
          </article>

          <article class="tarjeta">
            <span class="etiqueta">Ticket promedio</span>
            <span class="valor">{{ p.mes_actual.ticket_promedio | pesos }}</span>
            <span class="comparacion {{ deltaTicket().signo }}">
              {{ deltaTicket().texto }} vs {{ p.mes_anterior.etiqueta }}
            </span>
          </article>

          <article class="tarjeta">
            <span class="etiqueta">Clientes que volvieron</span>
            <span class="valor">{{ p.mes_actual.clientes_que_volvieron }}</span>
            <span class="comparacion neutro">
              de {{ p.mes_actual.clientes_atendidos }} clientes del mes
            </span>
          </article>
        </section>

        <section class="panel pila" aria-labelledby="t-ganancia">
          <div class="titulo-fila">
            <h2 id="t-ganancia">Lo que ganaste con tu trabajo</h2>
            <span class="suave">{{ p.mes_actual.etiqueta }}</span>
          </div>
          <p class="suave">
            La mano de obra es lo que te queda. Los repuestos, en gran parte, son plata que pasa de largo.
          </p>

          <div class="partes">
            <div class="parte parte-mano">
              <span class="etiqueta">Mano de obra</span>
              <span class="valor">{{ p.mes_actual.facturado_mano_obra | pesos }}</span>
              <span class="porcentaje">{{ porcentaje(p.mes_actual.facturado_mano_obra, p.mes_actual.facturado) }}% del total</span>
            </div>
            <div class="parte parte-repuestos">
              <span class="etiqueta">Repuestos</span>
              <span class="valor">{{ p.mes_actual.facturado_repuestos | pesos }}</span>
              <span class="porcentaje">{{ porcentaje(p.mes_actual.facturado_repuestos, p.mes_actual.facturado) }}% del total</span>
            </div>
            @if (+p.mes_actual.facturado_otros > 0) {
              <div class="parte parte-otros">
                <span class="etiqueta">Otros</span>
                <span class="valor">{{ p.mes_actual.facturado_otros | pesos }}</span>
                <span class="porcentaje">{{ porcentaje(p.mes_actual.facturado_otros, p.mes_actual.facturado) }}% del total</span>
              </div>
            }
          </div>

          <div class="barra-partes" aria-hidden="true">
            <span class="segmento mano" [style.width.%]="porcentaje(p.mes_actual.facturado_mano_obra, p.mes_actual.facturado)"></span>
            <span class="segmento repuestos" [style.width.%]="porcentaje(p.mes_actual.facturado_repuestos, p.mes_actual.facturado)"></span>
            <span class="segmento otros" [style.width.%]="porcentaje(p.mes_actual.facturado_otros, p.mes_actual.facturado)"></span>
          </div>

          <p class="suave comparacion-mano {{ deltaManoObra().signo }}">
            Mano de obra: {{ deltaManoObra().texto }} vs {{ p.mes_anterior.etiqueta }}
            ({{ p.mes_anterior.facturado_mano_obra | pesos }} el mes pasado).
          </p>
        </section>

        <section class="panel pila" aria-labelledby="t-frecuentes">
          <div class="titulo-fila">
            <h2 id="t-frecuentes">Trabajos más frecuentes</h2>
            <span class="suave">{{ p.mes_actual.etiqueta }}</span>
          </div>
          @if (p.trabajos_frecuentes.length) {
            <ul class="lista">
              @for (t of p.trabajos_frecuentes; track t.descripcion) {
                <li>
                  <span class="desc">{{ t.descripcion }}</span>
                  <span class="cuenta">{{ t.cantidad }} {{ t.cantidad === 1 ? 'vez' : 'veces' }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="suave">Todavía no hay mano de obra cargada en órdenes entregadas este mes.</p>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .encabezado { margin-bottom: 16px; }
    .encabezado h1 { margin-bottom: 4px; }
    .tarjetas {
      display: grid; gap: 12px; margin-bottom: 14px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .tarjeta {
      background: var(--superficie); border: 1px solid var(--linea); border-radius: 10px;
      padding: 16px 18px; display: flex; flex-direction: column; gap: 6px;
    }
    .tarjeta .etiqueta { color: var(--texto-suave); font-weight: 500; font-size: .95rem; }
    .tarjeta .valor { font: 700 1.8rem var(--fuente-angosta); color: var(--texto); }
    .tarjeta.destacada { border-left: 4px solid var(--ambar); }
    .comparacion { font-size: .9rem; font-weight: 500; }
    .comparacion.sube { color: var(--verde-oscuro); }
    .comparacion.baja { color: var(--rojo); }
    .comparacion.igual, .comparacion.neutro { color: var(--texto-suave); }
    .pila { display: flex; flex-direction: column; gap: 14px; }
    .titulo-fila { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .partes { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .parte { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: var(--radio); background: var(--fondo); }
    .parte .etiqueta { color: var(--texto-suave); font-weight: 600; font-size: .9rem; }
    .parte .valor { font: 700 1.4rem var(--fuente-angosta); }
    .parte .porcentaje { font-size: .85rem; color: var(--texto-suave); }
    .parte-mano { border-left: 4px solid var(--verde); }
    .parte-repuestos { border-left: 4px solid var(--azul); }
    .parte-otros { border-left: 4px solid var(--gris); }
    .barra-partes {
      display: flex; height: 10px; border-radius: 999px; overflow: hidden; background: var(--linea);
    }
    .segmento.mano { background: var(--verde); }
    .segmento.repuestos { background: var(--azul); }
    .segmento.otros { background: var(--gris); }
    .comparacion-mano { font-size: .95rem; }
    .lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .lista li {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      padding: 10px 0; border-top: 1px solid var(--linea);
    }
    .lista li:first-child { border-top: 0; padding-top: 0; }
    .desc { font-weight: 500; }
    .cuenta { color: var(--texto-suave); font: 700 .95rem var(--fuente-angosta); white-space: nowrap; }
  `,
})
export class NumerosPagina implements OnInit {
  private api = inject(ApiService);

  panel = signal<PanelNumeros | null>(null);
  error = signal('');

  deltaEntregadas = computed(() => this.deltaNumero(this.panel()?.mes_actual.entregadas, this.panel()?.mes_anterior.entregadas));
  deltaFacturado = computed(() => this.deltaPesos(this.panel()?.mes_actual.facturado, this.panel()?.mes_anterior.facturado));
  deltaTicket = computed(() => this.deltaPesos(this.panel()?.mes_actual.ticket_promedio, this.panel()?.mes_anterior.ticket_promedio));
  deltaManoObra = computed(() => this.deltaPesos(this.panel()?.mes_actual.facturado_mano_obra, this.panel()?.mes_anterior.facturado_mano_obra));

  async ngOnInit() {
    try {
      this.panel.set(await this.api.numeros());
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    }
  }

  porcentaje(parte: string, total: string): number {
    const t = Number(total);
    if (!t) return 0;
    return Math.round((Number(parte) / t) * 100);
  }

  private deltaNumero(actual: number | undefined, anterior: number | undefined): Delta {
    if (actual == null || anterior == null) return { texto: 'sin datos', signo: 'igual' };
    const diff = actual - anterior;
    if (diff === 0) return { texto: 'igual', signo: 'igual' };
    const flecha = diff > 0 ? '↑' : '↓';
    const porcentaje = anterior === 0 ? null : Math.round(Math.abs(diff) * 100 / anterior);
    const detalle = porcentaje == null ? `${Math.abs(diff)}` : `${porcentaje}%`;
    return { texto: `${flecha} ${detalle}`, signo: diff > 0 ? 'sube' : 'baja' };
  }

  private deltaPesos(actualStr: string | undefined, anteriorStr: string | undefined): Delta {
    const actual = Number(actualStr ?? 0);
    const anterior = Number(anteriorStr ?? 0);
    if (!actualStr || !anteriorStr) return { texto: 'sin datos', signo: 'igual' };
    const diff = actual - anterior;
    if (Math.abs(diff) < 0.01) return { texto: 'igual', signo: 'igual' };
    const flecha = diff > 0 ? '↑' : '↓';
    const porcentaje = anterior === 0 ? null : Math.round(Math.abs(diff) * 100 / anterior);
    const detalle = porcentaje == null ? '' : ` ${porcentaje}%`;
    return { texto: `${flecha}${detalle}`.trim(), signo: diff > 0 ? 'sube' : 'baja' };
  }
}

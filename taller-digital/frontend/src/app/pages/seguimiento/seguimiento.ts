import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { ApiService, errorDe } from '../../core/api.service';
import { EstadoOrden, OrdenPublica } from '../../core/modelos';
import { CantidadPipe, CuandoPipe, ETIQUETA_ESTADO, Patente, PesosPipe, nombreVehiculo } from '../../shared/compartido';

interface Paso {
  estado: EstadoOrden;
  texto: string;
  hecho: boolean;
  actual: boolean;
  fecha: string | null;
}

const ORDEN_PASOS: EstadoOrden[] = ['recibido', 'diagnostico', 'esperando_aprobacion', 'en_reparacion', 'listo', 'entregado'];

/**
 * La página que abre el cliente desde WhatsApp. Sin login, sin menú:
 * cómo está su vehículo y, si hay presupuesto, un botón para aprobarlo.
 */
@Component({
  selector: 'app-seguimiento',
  imports: [FormsModule, Patente, PesosPipe, CantidadPipe, CuandoPipe],
  template: `
    <div class="pagina">
      @if (datos(); as d) {
        <header class="barra">
          <span class="logo" aria-hidden="true">{{ inicial() }}</span>
          <span>{{ d.taller.nombre }}</span>
        </header>

        <main class="contenido">
          <section class="tarjeta pila">
            <app-patente [valor]="d.vehiculo.patente" [tipo]="d.vehiculo.tipo" [grande]="true" />
            <div>
              <h1>Hola {{ d.cliente.nombre }}, tu {{ nombre(d.vehiculo) }}</h1>
              <p class="suave">Orden n.º {{ d.orden.numero }}</p>
            </div>

            @if (d.orden.estado === 'cancelada') {
              <p class="aviso aviso-info">La orden fue cancelada. Ante cualquier duda, comunicate con el taller.</p>
            } @else {
              <ol class="pasos">
                @for (p of pasos(); track p.estado) {
                  <li [class.hecho]="p.hecho" [class.actual]="p.actual">
                    <span class="punto" aria-hidden="true">@if (p.hecho) { ✓ }</span>
                    <div>
                      <strong>{{ p.texto }}</strong>
                      @if (p.fecha) { <span class="suave fecha">{{ p.fecha | cuando }}</span> }
                      @else if (p.estado === 'listo' && !p.actual && !p.hecho && d.orden.fecha_estimada_entrega) {
                        <span class="suave fecha">Estimado: {{ d.orden.fecha_estimada_entrega | cuando: false }}</span>
                      }
                    </div>
                  </li>
                }
              </ol>
            }
          </section>

          @if (d.presupuesto; as p) {
            <section class="tarjeta pila" aria-labelledby="t-presupuesto">
              <h2 id="t-presupuesto">Presupuesto</h2>
              <ul class="items">
                @for (i of p.items; track $index) {
                  <li>
                    <span>{{ i.descripcion }}@if (+i.cantidad !== 1) { <span class="suave"> ({{ i.cantidad | cantidad }})</span> }</span>
                    <span class="monto">{{ i.subtotal | pesos }}</span>
                  </li>
                }
              </ul>
              <p class="total"><span>Total</span><span>{{ p.total | pesos }}</span></p>

              @if (error()) { <p class="aviso aviso-error" role="alert">{{ error() }}</p> }

              @switch (p.estado) {
                @case ('enviado') {
                  @if (!rechazando()) {
                    <button type="button" class="btn btn-verde btn-ancho grande" [disabled]="ocupado()" (click)="aprobar()">
                      {{ ocupado() ? 'Aprobando…' : 'Aprobar presupuesto' }}
                    </button>
                    @if (linkConsulta(); as link) {
                      <a class="btn btn-borde btn-ancho" [href]="link" target="_blank" rel="noopener">Tengo una consulta</a>
                    }
                    <button type="button" class="btn-texto" (click)="rechazando.set(true)">No lo quiero hacer por ahora</button>
                  } @else {
                    <div class="campo">
                      <label for="motivo">¿Querés contarle algo al taller? (opcional)</label>
                      <textarea id="motivo" class="textarea" placeholder="Ej: lo hablo y les aviso" [(ngModel)]="motivo"></textarea>
                    </div>
                    <button type="button" class="btn btn-oscuro btn-ancho" [disabled]="ocupado()" (click)="rechazar()">Avisar que no por ahora</button>
                    <button type="button" class="btn-texto" (click)="rechazando.set(false)">Volver</button>
                  }
                }
                @case ('aprobado') {
                  <p class="aviso aviso-ok">Aprobaste el presupuesto {{ p.respondido_at | cuando }}. El taller ya puede empezar.</p>
                }
                @case ('rechazado') {
                  <p class="aviso aviso-info">Le avisaste al taller que por ahora no. Si cambiás de idea, escribiles.</p>
                }
              }
            </section>
          }

          @if (d.pago; as pg) {
            @if (saldoNumero(pg.saldo) > 0) {
              <section class="tarjeta pila" aria-labelledby="t-pago">
                <h2 id="t-pago">Pago</h2>
                @if (saldoNumero(pg.pagado) > 0) {
                  <p class="suave">Ya pagaste {{ pg.pagado | pesos }} de {{ pg.total | pesos }}.</p>
                }
                <p class="total"><span>A pagar</span><span>{{ pg.saldo | pesos }}</span></p>
                @if (avisoPago(); as a) { <p class="aviso aviso-{{ a.tipo }}" role="status">{{ a.texto }}</p> }
                @if (pg.mp_disponible) {
                  <a class="btn btn-primario btn-ancho grande" [href]="linkPago()">Pagar online con Mercado Pago</a>
                  <p class="suave" style="text-align: center;">Vas al checkout de Mercado Pago. La plata va directo al taller.</p>
                } @else {
                  <p class="suave">El taller todavía no habilitó el pago online. Coordiná con ellos cómo abonarlo.</p>
                }
              </section>
            } @else if (pg.total !== '0.00') {
              <section class="tarjeta pila">
                <p class="aviso aviso-ok">Esta orden ya está paga. Total: {{ pg.total | pesos }}.</p>
              </section>
            }
          }

          @if (d.orden.estado === 'listo') {
            <p class="aviso aviso-ok listo">Tu {{ d.vehiculo.tipo === 'moto' ? 'moto' : 'auto' }} está listo para retirar.</p>
          }

          <footer class="pie suave">
            <strong>{{ d.taller.nombre }}</strong>
            @if (d.taller.direccion) { <span>{{ d.taller.direccion }}</span> }
            @if (d.taller.telefono) { <a [href]="'tel:+' + d.taller.telefono">Llamar al taller</a> }
          </footer>
        </main>
      } @else if (error()) {
        <main class="contenido">
          <section class="tarjeta pila">
            <h1>No encontramos esta orden</h1>
            <p class="suave">Revisá que el link esté completo o pedile uno nuevo al taller.</p>
          </section>
        </main>
      } @else {
        <p class="cargando">Cargando…</p>
      }
    </div>
  `,
  styles: `
    .pagina { min-height: 100vh; background: var(--fondo); }
    .barra {
      background: var(--grafito); color: #fff; font-weight: 700; font-size: 1.05rem;
      display: flex; align-items: center; gap: 10px; padding: 12px 16px;
    }
    .logo {
      width: 32px; height: 32px; border-radius: 7px; background: var(--ambar); color: var(--grafito);
      display: grid; place-items: center; font: 700 16px var(--fuente-angosta);
    }
    .contenido { max-width: 560px; margin: 0 auto; padding: 18px 16px 40px; display: flex; flex-direction: column; gap: 14px; }
    .tarjeta { background: var(--superficie); border: 1px solid var(--linea); border-radius: 12px; padding: 20px 18px; }
    .pila { display: flex; flex-direction: column; gap: 16px; }
    h1 { font-size: 1.35rem; }

    .pasos { list-style: none; margin: 4px 0 0; padding: 0; }
    .pasos li { display: grid; grid-template-columns: 26px 1fr; gap: 12px; position: relative; padding-bottom: 18px; }
    .pasos li:last-child { padding-bottom: 0; }
    .pasos li:not(:last-child)::after {
      content: ''; position: absolute; left: 12px; top: 26px; bottom: 0; width: 2px; background: var(--linea);
    }
    .pasos li.hecho:not(:last-child)::after { background: var(--verde); }
    .punto {
      width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--linea); background: #fff;
      display: grid; place-items: center; color: #fff; font-size: 13px; font-weight: 700;
    }
    .hecho .punto { background: var(--verde); border-color: var(--verde); }
    .actual .punto { border-color: var(--naranja); box-shadow: inset 0 0 0 5px #fff; background: var(--naranja); }
    .pasos li:not(.hecho):not(.actual) strong { color: var(--gris); font-weight: 500; }
    .fecha { display: block; font-size: .85rem; }

    .items { list-style: none; margin: 0; padding: 0; }
    .items li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--linea); }
    .monto { font: 700 1rem var(--fuente-angosta); white-space: nowrap; }
    .total { display: flex; justify-content: space-between; font-weight: 700; font-size: 1.1rem; }
    .total span:last-child { font: 700 1.6rem var(--fuente-angosta); }
    .grande { min-height: 60px; font-size: 1.1rem; }
    .btn-texto { align-self: center; }
    .listo { font-weight: 600; text-align: center; font-size: 1.05rem; }
    .pie { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; padding-top: 8px; }
  `,
})
export class Seguimiento implements OnInit {
  private api = inject(ApiService);
  private titulo = inject(Title);
  private ruta = inject(ActivatedRoute);

  token = input.required<string>();
  datos = signal<OrdenPublica | null>(null);
  error = signal('');
  ocupado = signal(false);
  rechazando = signal(false);
  motivo = '';
  avisoPago = signal<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);
  readonly nombre = nombreVehiculo;
  readonly saldoNumero = (v: string) => Number(v);
  linkPago = computed(() => `/api/publico/mp/iniciar-pago/${this.token()}`);

  inicial = computed(() => (this.datos()?.taller.nombre.replace(/^taller\s+/i, '').trim()[0] ?? 'T').toUpperCase());

  pasos = computed<Paso[]>(() => {
    const d = this.datos();
    if (!d) return [];
    // El paso de aprobación solo aparece si hubo presupuesto.
    const estados = ORDEN_PASOS.filter((e) => e !== 'esperando_aprobacion' || d.presupuesto);
    const actual = estados.indexOf(d.orden.estado);
    return estados.map((estado, i) => {
      const ultimo = [...d.linea_de_tiempo].reverse().find((e) => e.estado === estado);
      return {
        estado,
        texto: estado === 'esperando_aprobacion' ? 'Presupuesto' : ETIQUETA_ESTADO[estado],
        hecho: i < actual || (estado === 'entregado' && actual === i),
        actual: i === actual && estado !== 'entregado',
        fecha: i <= actual ? ultimo?.fecha ?? null : null,
      };
    });
  });

  async ngOnInit() {
    // Si volvemos del checkout de MP (/api/publico/mp/iniciar-pago no pudo o la orden ya estaba paga),
    // mostramos el aviso que coincida.
    const pago = this.ruta.snapshot.queryParamMap.get('pago');
    const avisos: Record<string, { tipo: 'ok' | 'error' | 'info'; texto: string }> = {
      ya_pagada: { tipo: 'ok', texto: 'Esta orden ya está paga.' },
      no_disponible: { tipo: 'info', texto: 'El taller todavía no habilitó el pago online.' },
      cancelada: { tipo: 'info', texto: 'La orden está cancelada.' },
      no_encontrado: { tipo: 'error', texto: 'No encontramos la orden.' },
      error: { tipo: 'error', texto: 'No pudimos iniciar el pago. Probá de nuevo o pagá en el taller.' },
    };
    if (pago && avisos[pago]) this.avisoPago.set(avisos[pago]);

    try {
      this.mostrar(await this.api.ordenPublica(this.token()));
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    }
  }

  private mostrar(d: OrdenPublica) {
    this.datos.set(d);
    this.titulo.setTitle(`${d.taller.nombre} · Orden n.º ${d.orden.numero}`);
  }

  async aprobar() {
    await this.responder(() => this.api.aprobarPresupuesto(this.token()));
  }

  async rechazar() {
    const ok = await this.responder(() => this.api.rechazarPresupuesto(this.token(), this.motivo.trim()));
    if (ok) this.rechazando.set(false);
  }

  private async responder(accion: () => Promise<OrdenPublica>) {
    this.ocupado.set(true);
    this.error.set('');
    try {
      this.mostrar(await accion());
      return true;
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
      // Puede haber cambiado algo (por ej. el taller actualizó el presupuesto): se recarga.
      this.api.ordenPublica(this.token()).then((d) => this.datos.set(d)).catch(() => undefined);
      return false;
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Link a WhatsApp del taller con la consulta ya escrita. */
  linkConsulta = computed(() => {
    const d = this.datos();
    if (!d?.taller.telefono) return null;
    const texto = `Hola, tengo una consulta sobre el presupuesto de la orden n.º ${d.orden.numero}.`;
    return `https://wa.me/${d.taller.telefono}?text=${encodeURIComponent(texto)}`;
  });
}

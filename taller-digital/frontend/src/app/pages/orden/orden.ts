import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, errorDe } from '../../core/api.service';
import { EstadoOrden, Evento, Orden, PlantillaWhatsapp, TipoItem } from '../../core/modelos';
import { CantidadPipe, CuandoPipe, ETIQUETA_ESTADO, KmPipe, Patente, PesosPipe, nombreVehiculo, textoAccion } from '../../shared/compartido';

/** El paso que conviene destacar en cada estado: el botón grande. */
const SIGUIENTE_PRINCIPAL: Partial<Record<EstadoOrden, EstadoOrden>> = {
  recibido: 'diagnostico',
  esperando_aprobacion: 'en_reparacion',
  en_reparacion: 'listo',
  listo: 'entregado',
};

const TIPOS_ITEM: { valor: TipoItem; texto: string }[] = [
  { valor: 'repuesto', texto: 'Repuesto' },
  { valor: 'mano_de_obra', texto: 'Mano de obra' },
  { valor: 'otro', texto: 'Otro' },
];

@Component({
  selector: 'app-orden',
  imports: [FormsModule, RouterLink, Patente, PesosPipe, CantidadPipe, CuandoPipe, KmPipe],
  template: `
    <div class="contenedor">
      @if (orden(); as o) {
        <a routerLink="/" class="volver">Volver al tablero</a>

        <header class="cabecera">
          <app-patente [valor]="o.vehiculo.patente" [tipo]="o.vehiculo.tipo" [grande]="true" />
          <div class="identidad">
            <h1>{{ nombreVehiculo() }}</h1>
            <p class="suave">
              Orden n.º {{ o.numero }}, recibido {{ o.fecha_ingreso | cuando }}
              @if (o.km_ingreso) { con {{ o.km_ingreso | km }} }
            </p>
          </div>
        </header>

        @if (error()) { <p class="aviso aviso-error" role="alert">{{ error() }}</p> }

        <!-- Aviso de "listo" después de marcarlo: va arriba, junto a los botones de estado -->
        @if (avisoPendiente(); as aviso) {
          @if (aviso.plantilla === 'listo') {
            <div class="panel avisar">
              <div>
                <strong>{{ aviso.titulo }}</strong>
                <p class="suave">Se abre WhatsApp con el mensaje escrito. Solo tenés que tocar enviar.</p>
              </div>
              <a class="btn btn-whatsapp" [href]="aviso.url" target="_blank" rel="noopener" (click)="avisoAbierto(aviso.plantilla)">Abrir WhatsApp</a>
              <button type="button" class="btn-texto" (click)="avisoPendiente.set(null)">Ahora no</button>
            </div>
          }
        }

        <div class="grilla">
          <div class="principal">
            <!-- Estado y acciones -->
            <section class="panel" aria-labelledby="t-estado">
              <h2 id="t-estado" class="oculto">Estado</h2>
              <p class="estado-actual estado estado-{{ o.estado }}">{{ etiqueta[o.estado] }}</p>
              @if (o.estado === 'esperando_aprobacion') {
                <p class="suave">Presupuesto enviado {{ o.presupuesto.enviado_at | cuando }}</p>
                <p class="suave">Si el cliente te avisó por teléfono que lo aprueba, marcalo con el botón de abajo.</p>
              }

              @if (o.estados_siguientes.length) {
                <div class="acciones">
                  @if (principal(); as p) {
                    <button type="button" class="btn btn-primario" [disabled]="ocupado()" (click)="mover(p)">
                      {{ texto(o.estado, p) }}
                    </button>
                  }
                  @for (e of secundarios(); track e) {
                    <button type="button" class="btn btn-borde" [disabled]="ocupado()" (click)="mover(e)">
                      {{ texto(o.estado, e) }}
                    </button>
                  }
                  @if (o.estados_siguientes.includes('cancelada')) {
                    <button type="button" class="btn-peligro" [disabled]="ocupado()" (click)="cancelar()">Cancelar orden</button>
                  }
                </div>
              } @else {
                <p class="suave">
                  @if (o.estado === 'entregado') { Entregado {{ o.fecha_entrega | cuando }}. La orden quedó cerrada. }
                  @else { La orden quedó cerrada. }
                </p>
              }
            </section>

            <!-- Qué le pasa y diagnóstico -->
            <section class="panel pila" aria-labelledby="t-trabajo">
              <div class="titulo-fila">
                <h2 id="t-trabajo">Qué le pasa</h2>
                @if (!editandoMotivo()) {
                  <button type="button" class="btn-texto" (click)="empezarEditarMotivo(o)">Editar</button>
                }
              </div>

              @if (!editandoMotivo()) {
                <p>{{ o.motivo }}</p>
                @if (o.km_ingreso) {
                  <p class="suave">Entró con {{ o.km_ingreso | km }}</p>
                }
              } @else {
                <div class="campo">
                  <label for="motivo-edit">¿Qué le pasa o qué hay que hacerle?</label>
                  <textarea id="motivo-edit" class="textarea" [(ngModel)]="motivoEditado"></textarea>
                </div>
                <div class="campo km-corto">
                  <label for="km-edit">Kilómetros de ingreso</label>
                  <input id="km-edit" class="input" type="number" inputmode="numeric" min="0" [(ngModel)]="kmEditado" />
                </div>
                <div class="acciones-form">
                  <button type="button" class="btn btn-oscuro" [disabled]="ocupado() || motivoEditado.trim().length < 3"
                          (click)="guardarMotivo()">Guardar</button>
                  <button type="button" class="btn-texto" (click)="editandoMotivo.set(false)">Cancelar</button>
                </div>
              }

              @if (abierta()) {
                <div class="campo">
                  <label for="diagnostico">Diagnóstico</label>
                  <textarea id="diagnostico" class="textarea" placeholder="Qué encontraste y qué hay que hacer"
                            [(ngModel)]="diagnostico"></textarea>
                </div>
                @if (diagnostico !== (o.diagnostico ?? '')) {
                  <button type="button" class="btn btn-oscuro" [disabled]="ocupado()" (click)="guardarDiagnostico()">Guardar diagnóstico</button>
                }
              } @else if (o.diagnostico) {
                <div><h3>Diagnóstico</h3><p>{{ o.diagnostico }}</p></div>
              }
            </section>

            <!-- Presupuesto -->
            <section class="panel pila" aria-labelledby="t-presupuesto">
              <div class="titulo-fila">
                <h2 id="t-presupuesto">Presupuesto</h2>
                <span class="suave">{{ estadoPresupuesto() }}</span>
              </div>

              @if (o.items.length) {
                <ul class="items">
                  @for (i of o.items; track i.id) {
                    <li>
                      <div>
                        <span class="desc">{{ i.descripcion }}</span>
                        <span class="suave detalle">
                          {{ tipoTexto(i.tipo) }}@if (+i.cantidad !== 1) {, {{ i.cantidad | cantidad }} × {{ i.precio_unitario | pesos }}}
                        </span>
                      </div>
                      <span class="monto">{{ i.subtotal | pesos }}</span>
                      @if (abierta()) {
                        <button type="button" class="quitar" [attr.aria-label]="'Quitar ' + i.descripcion"
                                [disabled]="ocupado()" (click)="quitarItem(i.id)">×</button>
                      }
                    </li>
                  }
                </ul>
                <p class="total"><span>Total</span><span>{{ o.total | pesos }}</span></p>

                <div class="pdf-acciones">
                  <button type="button" class="btn btn-borde" [disabled]="descargandoPdf()" (click)="descargarPdf()">
                    {{ descargandoPdf() ? 'Generando…' : textoPdf() }}
                  </button>
                  @if (o.whatsapp?.pdf) {
                    <a class="btn btn-whatsapp" [href]="o.whatsapp!.pdf" target="_blank" rel="noopener"
                       (click)="avisoAbierto('pdf')">Enviar PDF por WhatsApp</a>
                  }
                </div>
              } @else {
                <p class="suave">Todavía no cargaste repuestos ni mano de obra.</p>
              }

              @if (abierta()) {
                <form class="nuevo-item pila" (ngSubmit)="agregarItem()">
                  <div class="opciones" role="group" aria-label="Tipo de ítem">
                    @for (t of tipos; track t.valor) {
                      <button type="button" class="opcion" [attr.aria-pressed]="tipoItem === t.valor" (click)="tipoItem = t.valor">{{ t.texto }}</button>
                    }
                  </div>
                  <div class="campo">
                    <label for="desc">Descripción</label>
                    <input id="desc" name="desc" class="input" [placeholder]="tipoItem === 'mano_de_obra' ? 'Cambio de embrague' : 'Kit de distribución'" [(ngModel)]="descItem" />
                  </div>
                  <div class="fila cant-precio">
                    <div class="campo">
                      <label for="cant">Cantidad</label>
                      <input id="cant" name="cant" class="input" type="number" inputmode="decimal" min="0.01" step="any" [(ngModel)]="cantItem" />
                    </div>
                    <div class="campo">
                      <label for="precio">Precio por unidad</label>
                      <input id="precio" name="precio" class="input" type="number" inputmode="decimal" min="0" step="any" placeholder="0" [(ngModel)]="precioItem" />
                    </div>
                  </div>
                  <button type="submit" class="btn btn-oscuro" [disabled]="!puedeAgregar() || ocupado()">Agregar al presupuesto</button>
                </form>

                @if (avisoPendiente()?.plantilla === 'presupuesto') {
                  <!-- Recién enviado: el link para abrir WhatsApp aparece acá mismo, donde tocaste -->
                  <div class="avisar">
                    <div>
                      <strong>{{ avisoPendiente()!.titulo }}</strong>
                      <p class="suave">Se abre WhatsApp con el mensaje y el link. Solo tenés que tocar enviar.</p>
                    </div>
                    <a class="btn btn-whatsapp" [href]="avisoPendiente()!.url" target="_blank" rel="noopener" (click)="avisoAbierto('presupuesto')">Abrir WhatsApp</a>
                  </div>
                } @else if (o.presupuesto.estado === 'enviado' && o.whatsapp) {
                  <a class="btn btn-whatsapp btn-ancho" [href]="o.whatsapp.presupuesto" target="_blank" rel="noopener" (click)="avisoAbierto('presupuesto')">
                    Reenviar presupuesto por WhatsApp
                  </a>
                } @else if (puedeEnviarPresupuesto()) {
                  <button type="button" class="btn btn-whatsapp btn-ancho" [disabled]="ocupado()" (click)="enviarPresupuesto()">
                    Enviar presupuesto por WhatsApp
                  </button>
                }
              }
            </section>
          </div>

          <aside class="lateral">
            <section class="panel pila" aria-labelledby="t-cliente">
              <div class="titulo-fila">
                <h2 id="t-cliente">Cliente</h2>
                @if (!editandoCliente()) {
                  <button type="button" class="btn-texto" (click)="empezarEditarCliente(o)">Editar</button>
                }
              </div>

              @if (!editandoCliente()) {
                <div>
                  <p class="cliente">{{ o.cliente.nombre }}</p>
                  @if (o.cliente.telefono) {
                    <a [href]="'tel:+' + o.cliente.telefono">{{ telefonoLegible() }}</a>
                  } @else {
                    <p class="suave">Sin celular cargado: no se le pueden mandar avisos.</p>
                  }
                </div>
                @if (o.whatsapp) {
                  <a class="btn btn-borde" [href]="o.whatsapp[plantillaSugerida()]" target="_blank" rel="noopener"
                     (click)="avisoAbierto(plantillaSugerida())">Escribirle por WhatsApp</a>
                }
                <a [routerLink]="['/vehiculos', o.vehiculo.id]">Ver historial del vehículo</a>
              } @else {
                <div class="campo">
                  <label for="cli-nombre">Nombre</label>
                  <input id="cli-nombre" class="input" [(ngModel)]="clienteNombre" />
                </div>
                <div class="campo">
                  <label for="cli-tel">Celular</label>
                  <input id="cli-tel" class="input" type="tel" inputmode="tel" placeholder="221 555-0143"
                         [(ngModel)]="clienteTelefono" />
                  <span class="ayuda">Para avisarle por WhatsApp.</span>
                </div>
                <div class="acciones-form">
                  <button type="button" class="btn btn-oscuro" [disabled]="ocupado() || clienteNombre.trim().length < 2"
                          (click)="guardarCliente()">Guardar</button>
                  <button type="button" class="btn-texto" (click)="editandoCliente.set(false)">Cancelar</button>
                </div>
              }
            </section>

            <section class="panel pila" aria-labelledby="t-bitacora">
              <h2 id="t-bitacora">Qué pasó</h2>
              <ol class="bitacora">
                @for (e of eventosRecientes(); track e.id) {
                  <li>
                    <span>{{ textoEvento(e) }}</span>
                    <span class="suave quien">{{ e.created_at | cuando }}@if (e.usuario_nombre) {, {{ e.usuario_nombre }}}</span>
                  </li>
                }
              </ol>
              <form class="nota" (ngSubmit)="agregarNota()">
                <label for="nota" class="oculto">Agregar nota</label>
                <input id="nota" name="nota" class="input" placeholder="Agregar una nota" [(ngModel)]="nota" />
                <button type="submit" class="btn btn-borde" [disabled]="!nota.trim() || ocupado()">Agregar</button>
              </form>
            </section>
          </aside>
        </div>
      } @else if (error()) {
        <p class="aviso aviso-error" role="alert">{{ error() }}</p>
        <a routerLink="/">Volver al tablero</a>
      } @else {
        <p class="cargando">Cargando la orden…</p>
      }
    </div>
  `,
  styleUrl: './orden.css',
})
export class OrdenPagina implements OnInit {
  private api = inject(ApiService);

  /** Viene de la ruta /ordenes/:id (withComponentInputBinding). */
  id = input.required<string>();

  orden = signal<Orden | null>(null);
  ocupado = signal(false);
  error = signal('');
  avisoPendiente = signal<{ titulo: string; url: string; plantilla: PlantillaWhatsapp } | null>(null);

  readonly etiqueta = ETIQUETA_ESTADO;
  readonly tipos = TIPOS_ITEM;
  readonly texto = textoAccion;

  diagnostico = '';
  nota = '';
  tipoItem: TipoItem = 'repuesto';
  descItem = '';
  cantItem: number | null = 1;
  precioItem: number | null = null;

  editandoMotivo = signal(false);
  motivoEditado = '';
  kmEditado: number | null = null;

  editandoCliente = signal(false);
  clienteNombre = '';
  clienteTelefono = '';

  descargandoPdf = signal(false);

  textoPdf = computed(() => {
    const estado = this.orden()?.estado;
    const esPresupuesto = estado && ['recibido', 'diagnostico', 'esperando_aprobacion'].includes(estado);
    return esPresupuesto ? 'Descargar presupuesto (PDF)' : 'Descargar comprobante (PDF)';
  });

  abierta = computed(() => {
    const o = this.orden();
    return !!o && o.estado !== 'entregado' && o.estado !== 'cancelada';
  });

  principal = computed(() => {
    const o = this.orden();
    if (!o) return null;
    const p = SIGUIENTE_PRINCIPAL[o.estado];
    return p && o.estados_siguientes.includes(p) ? p : null;
  });

  secundarios = computed(() => {
    const o = this.orden();
    if (!o) return [];
    return o.estados_siguientes.filter((e) => e !== 'cancelada' && e !== this.principal());
  });

  nombreVehiculo = computed(() => {
    const v = this.orden()?.vehiculo;
    return v ? nombreVehiculo(v) : '';
  });

  telefonoLegible = computed(() => {
    const t = this.orden()?.cliente.telefono ?? '';
    // 5492215550143 -> 221 555-0143
    const m = t.match(/^549(\d{2,4})(\d{3,4})(\d{4})$/);
    return m ? `${m[1]} ${m[2]}-${m[3]}` : `+${t}`;
  });

  estadoPresupuesto = computed(() => {
    const o = this.orden();
    if (!o || !o.items.length) return '';
    return { borrador: 'Sin enviar', enviado: 'Enviado, esperando respuesta', aprobado: 'Aprobado', rechazado: 'Rechazado' }[o.presupuesto.estado];
  });

  puedeEnviarPresupuesto = computed(() => {
    const o = this.orden();
    return !!o && o.items.length > 0 && !!o.cliente.telefono && o.presupuesto.estado !== 'aprobado'
      && ['recibido', 'diagnostico', 'esperando_aprobacion'].includes(o.estado);
  });

  /** El mensaje que corresponde al momento de la orden, para "Escribirle por WhatsApp". */
  plantillaSugerida = computed<PlantillaWhatsapp>(() => {
    const estado = this.orden()?.estado;
    if (estado === 'listo' || estado === 'entregado') return 'listo';
    if (estado === 'esperando_aprobacion') return 'presupuesto';
    return 'recibido';
  });

  eventosRecientes = computed(() => [...(this.orden()?.eventos ?? [])].reverse());

  ngOnInit() {
    this.cargar();
  }

  private async cargar() {
    try {
      this.mostrar(await this.api.orden(Number(this.id())));
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    }
  }

  private mostrar(o: Orden) {
    this.orden.set(o);
    this.diagnostico = o.diagnostico ?? '';
  }

  /** Ejecuta una acción contra la API mostrando el estado de carga y los errores. */
  private async hacer(accion: () => Promise<Orden>) {
    this.ocupado.set(true);
    this.error.set('');
    try {
      const o = await accion();
      this.mostrar(o);
      return o;
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
      return null;
    } finally {
      this.ocupado.set(false);
    }
  }

  async mover(estado: EstadoOrden) {
    const o = await this.hacer(() => this.api.cambiarEstado(this.orden()!.id, estado));
    if (o?.whatsapp_url && estado === 'listo') {
      this.avisoPendiente.set({ titulo: `Avisale a ${o.cliente.nombre} que está listo`, url: o.whatsapp_url, plantilla: 'listo' });
    }
  }

  cancelar() {
    if (confirm('¿Cancelar esta orden? No se puede deshacer.')) this.mover('cancelada');
  }

  guardarDiagnostico() {
    this.hacer(() => this.api.editarOrden(this.orden()!.id, { diagnostico: this.diagnostico.trim() || null }));
  }

  empezarEditarMotivo(o: Orden) {
    this.motivoEditado = o.motivo;
    this.kmEditado = o.km_ingreso;
    this.editandoMotivo.set(true);
  }

  async guardarMotivo() {
    const o = this.orden()!;
    const cambios: { motivo?: string; km_ingreso?: number | null } = {};
    const motivo = this.motivoEditado.trim();
    if (motivo !== o.motivo) cambios.motivo = motivo;
    const km = this.kmEditado ?? null;
    if (km !== (o.km_ingreso ?? null)) cambios.km_ingreso = km;
    if (Object.keys(cambios).length === 0) {
      this.editandoMotivo.set(false);
      return;
    }
    const actualizada = await this.hacer(() => this.api.editarOrden(o.id, cambios));
    if (actualizada) this.editandoMotivo.set(false);
  }

  empezarEditarCliente(o: Orden) {
    this.clienteNombre = o.cliente.nombre;
    this.clienteTelefono = o.cliente.telefono ?? '';
    this.editandoCliente.set(true);
  }

  async guardarCliente() {
    const o = this.orden()!;
    const nombre = this.clienteNombre.trim();
    const telefono = this.clienteTelefono.trim();
    const cambios: { nombre?: string; telefono?: string | null } = {};
    if (nombre !== o.cliente.nombre) cambios.nombre = nombre;
    const telefonoActual = o.cliente.telefono ?? '';
    if (telefono !== telefonoActual) cambios.telefono = telefono || null;
    if (Object.keys(cambios).length === 0) {
      this.editandoCliente.set(false);
      return;
    }
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.api.editarCliente(o.cliente.id, cambios);
      await this.cargar();
      this.editandoCliente.set(false);
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    } finally {
      this.ocupado.set(false);
    }
  }

  puedeAgregar() {
    return this.descItem.trim().length > 0 && (this.cantItem ?? 0) > 0 && this.precioItem != null && this.precioItem >= 0;
  }

  async agregarItem() {
    const o = await this.hacer(() => this.api.agregarItem(this.orden()!.id, {
      tipo: this.tipoItem,
      descripcion: this.descItem.trim(),
      cantidad: this.cantItem ?? 1,
      precio_unitario: this.precioItem ?? 0,
    }));
    if (o) {
      this.descItem = '';
      this.cantItem = 1;
      this.precioItem = null;
    }
  }

  quitarItem(itemId: number) {
    this.hacer(() => this.api.eliminarItem(this.orden()!.id, itemId));
  }

  async descargarPdf() {
    const o = this.orden();
    if (!o) return;
    this.descargandoPdf.set(true);
    this.error.set('');
    try {
      const blob = await this.api.pdfOrden(o.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      // Lo liberamos un rato después para que la pestaña nueva lo levante.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    } finally {
      this.descargandoPdf.set(false);
    }
  }

  async enviarPresupuesto() {
    const o = await this.hacer(() => this.api.enviarPresupuesto(this.orden()!.id));
    if (o?.whatsapp_url) {
      this.avisoPendiente.set({ titulo: `Mandale el presupuesto a ${o.cliente.nombre}`, url: o.whatsapp_url, plantilla: 'presupuesto' });
    }
  }

  /**
   * Se llama al tocar cualquier link de WhatsApp. El link en sí lo abre el navegador
   * (por eso funciona en iPhone); acá solo se deja registrado en la bitácora.
   */
  avisoAbierto(plantilla: PlantillaWhatsapp) {
    this.avisoPendiente.set(null);
    this.api.registrarAviso(this.orden()!.id, plantilla).then(() => this.cargar()).catch(() => undefined);
  }

  async agregarNota() {
    const detalle = this.nota.trim();
    if (!detalle) return;
    const o = await this.hacer(() => this.api.agregarNota(this.orden()!.id, detalle));
    if (o) this.nota = '';
  }

  tipoTexto(tipo: TipoItem) {
    return TIPOS_ITEM.find((t) => t.valor === tipo)?.texto ?? tipo;
  }

  textoEvento(e: Evento): string {
    switch (e.tipo) {
      case 'creada': return 'Recibido en el taller';
      case 'cambio_estado': return `Pasó a ${ETIQUETA_ESTADO[e.estado_hasta!].toLowerCase()}${e.detalle ? `: ${e.detalle}` : ''}`;
      case 'presupuesto_enviado': return 'Se envió el presupuesto';
      case 'presupuesto_aprobado': return e.detalle === 'Aprobado por el taller' ? 'Presupuesto aprobado por teléfono' : 'El cliente aprobó el presupuesto';
      case 'presupuesto_rechazado': return `El cliente rechazó el presupuesto${e.detalle ? `: ${e.detalle}` : ''}`;
      case 'aviso_whatsapp': return 'Se le avisó por WhatsApp';
      case 'nota': return e.detalle ?? '';
    }
  }
}

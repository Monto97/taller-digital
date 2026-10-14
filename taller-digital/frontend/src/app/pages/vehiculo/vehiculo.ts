import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, DatosEditarVehiculo, errorDe } from '../../core/api.service';
import { ClienteResumen, OrdenHistorial, TipoVehiculo, Vehiculo } from '../../core/modelos';
import { CantidadPipe, CuandoPipe, ETIQUETA_ESTADO, KmPipe, Patente, PesosPipe, nombreVehiculo, normalizarPatente } from '../../shared/compartido';

type ModoDueno = 'cerrado' | 'buscar' | 'nuevo';

@Component({
  selector: 'app-vehiculo',
  imports: [FormsModule, RouterLink, Patente, PesosPipe, CantidadPipe, CuandoPipe, KmPipe],
  template: `
    <div class="contenedor">
      @if (vehiculo(); as v) {
        <a routerLink="/" class="volver">Volver al tablero</a>

        <div class="grilla">
          <section class="panel ficha">
            <app-patente [valor]="v.patente" [tipo]="v.tipo" [grande]="true" />

            @if (!editando()) {
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

              <button type="button" class="btn-texto editar" (click)="empezarEdicion(v)">Editar datos</button>
            } @else {
              <form class="pila" (ngSubmit)="guardar(v)">
                <div class="campo">
                  <label for="patente">Patente</label>
                  <input id="patente" name="patente" class="input patente-input" autocomplete="off"
                         autocapitalize="characters" [(ngModel)]="patente" />
                </div>

                <div class="campo">
                  <span class="etiqueta" id="tipo-label">Tipo</span>
                  <div class="opciones" role="group" aria-labelledby="tipo-label">
                    <button type="button" class="opcion" [attr.aria-pressed]="tipo === 'auto'" (click)="tipo = 'auto'">Auto</button>
                    <button type="button" class="opcion" [attr.aria-pressed]="tipo === 'moto'" (click)="tipo = 'moto'">Moto</button>
                  </div>
                </div>

                <div class="fila fila-2">
                  <div class="campo">
                    <label for="marca">Marca</label>
                    <input id="marca" name="marca" class="input" [(ngModel)]="marca" />
                  </div>
                  <div class="campo">
                    <label for="modelo">Modelo</label>
                    <input id="modelo" name="modelo" class="input" [(ngModel)]="modelo" />
                  </div>
                </div>

                <div class="fila fila-2">
                  <div class="campo">
                    <label for="anio">Año</label>
                    <input id="anio" name="anio" class="input" type="number" inputmode="numeric" min="1950" [(ngModel)]="anio" />
                  </div>
                  <div class="campo">
                    <label for="km">Kilómetros</label>
                    <input id="km" name="km" class="input" type="number" inputmode="numeric" min="0" [(ngModel)]="km" />
                  </div>
                </div>

                <div class="campo">
                  <span class="etiqueta">Dueño</span>
                  <p class="dueno-actual">
                    <strong>{{ duenoPendiente()?.nombre ?? v.cliente.nombre }}</strong>
                    @if (duenoPendiente()) {
                      <span class="suave"> (nuevo dueño sin guardar)</span>
                    }
                  </p>
                  @if (modoDueno() === 'cerrado') {
                    <button type="button" class="btn-texto" (click)="abrirCambioDueno()">
                      {{ duenoPendiente() ? 'Elegir otro dueño' : 'Cambiar dueño (auto vendido)' }}
                    </button>
                    @if (duenoPendiente()) {
                      <button type="button" class="btn-texto" (click)="duenoPendiente.set(null)">Cancelar cambio de dueño</button>
                    }
                  }
                </div>

                @if (modoDueno() === 'buscar') {
                  <div class="buscar-dueno pila">
                    <div class="campo">
                      <label for="busca-dueno">Buscar por nombre o celular</label>
                      <input id="busca-dueno" name="busca-dueno" class="input" autocomplete="off"
                             [(ngModel)]="busqueda" (input)="buscar()" />
                    </div>
                    @if (resultados().length) {
                      <ul class="resultados">
                        @for (c of resultados(); track c.id) {
                          <li>
                            <button type="button" class="resultado" (click)="elegirDueno(c)">
                              <strong>{{ c.nombre }}</strong>
                              @if (c.telefono) { <span class="suave">{{ c.telefono }}</span> }
                            </button>
                          </li>
                        }
                      </ul>
                    } @else if (busqueda.trim().length >= 2 && !buscando()) {
                      <p class="suave">No hay coincidencias.</p>
                    }
                    <div class="acciones-dueno">
                      <button type="button" class="btn-texto" (click)="modoDueno.set('nuevo'); resultados.set([])">
                        Es un dueño nuevo
                      </button>
                      <button type="button" class="btn-texto" (click)="cerrarCambioDueno()">Cancelar</button>
                    </div>
                  </div>
                }

                @if (modoDueno() === 'nuevo') {
                  <div class="buscar-dueno pila">
                    <div class="fila fila-2">
                      <div class="campo">
                        <label for="nuevo-nombre">Nombre del dueño nuevo</label>
                        <input id="nuevo-nombre" name="nuevo-nombre" class="input" [(ngModel)]="nuevoNombre" />
                      </div>
                      <div class="campo">
                        <label for="nuevo-tel">Celular</label>
                        <input id="nuevo-tel" name="nuevo-tel" class="input" type="tel" inputmode="tel"
                               placeholder="221 555-0143" [(ngModel)]="nuevoTelefono" />
                      </div>
                    </div>
                    <div class="acciones-dueno">
                      <button type="button" class="btn btn-oscuro" [disabled]="ocupado() || nuevoNombre.trim().length < 2"
                              (click)="crearDueno()">
                        Usar este dueño nuevo
                      </button>
                      <button type="button" class="btn-texto" (click)="modoDueno.set('buscar')">Volver a buscar</button>
                    </div>
                  </div>
                }

                @if (error()) {
                  <p class="aviso aviso-error" role="alert">
                    {{ error() }}
                    @if (patenteInvalida()) {
                      <button type="button" class="btn-texto" (click)="formatoLibre = true; error.set(''); patenteInvalida.set(false)">
                        Es una patente extranjera o de otro formato
                      </button>
                    }
                  </p>
                }

                <div class="acciones-form">
                  <button type="submit" class="btn btn-primario" [disabled]="ocupado()">
                    {{ ocupado() ? 'Guardando…' : 'Guardar cambios' }}
                  </button>
                  <button type="button" class="btn-texto" (click)="cancelar()">Cancelar</button>
                </div>
              </form>
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
                  <a [routerLink]="['/ordenes', o.id]" class="motivo">{{ o.motivo || 'Ver orden n.º ' + o.numero }}</a>
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
    .ficha form { align-self: stretch; }
    .pila { display: flex; flex-direction: column; gap: 14px; }
    .etiqueta { font-weight: 600; font-size: .95rem; }
    .dueno-actual { margin: 0; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; margin: 0; }
    dt { color: var(--texto-suave); }
    dd { margin: 0; font-weight: 500; }
    .editar { align-self: flex-start; margin-top: -4px; }
    .patente-input {
      font: 700 1.4rem var(--fuente-angosta); letter-spacing: 2px; text-transform: uppercase;
      text-align: center;
    }
    .buscar-dueno {
      padding: 12px; border: 1px dashed var(--linea); border-radius: var(--radio); background: #f6f7f9;
    }
    .resultados { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .resultado {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      width: 100%; min-height: 44px; padding: 8px 12px;
      background: var(--superficie); border: 1px solid var(--linea); border-radius: var(--radio);
      font: 500 .95rem var(--fuente); color: var(--texto); cursor: pointer; text-align: left;
    }
    .resultado:hover { border-color: var(--gris); }
    .acciones-dueno { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .acciones-form { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
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

  editando = signal(false);
  ocupado = signal(false);
  patenteInvalida = signal(false);

  patente = '';
  tipo: TipoVehiculo = 'auto';
  marca = '';
  modelo = '';
  anio: number | null = null;
  km: number | null = null;
  formatoLibre = false;

  modoDueno = signal<ModoDueno>('cerrado');
  busqueda = '';
  resultados = signal<ClienteResumen[]>([]);
  buscando = signal(false);
  nuevoNombre = '';
  nuevoTelefono = '';
  duenoPendiente = signal<ClienteResumen | null>(null);
  private busquedaTimer: ReturnType<typeof setTimeout> | null = null;

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

  empezarEdicion(v: Vehiculo) {
    this.patente = v.patente;
    this.tipo = v.tipo;
    this.marca = v.marca ?? '';
    this.modelo = v.modelo ?? '';
    this.anio = v.anio;
    this.km = v.km_actual;
    this.formatoLibre = false;
    this.patenteInvalida.set(false);
    this.duenoPendiente.set(null);
    this.modoDueno.set('cerrado');
    this.error.set('');
    this.editando.set(true);
  }

  cancelar() {
    this.editando.set(false);
    this.error.set('');
  }

  abrirCambioDueno() {
    this.busqueda = '';
    this.resultados.set([]);
    this.nuevoNombre = '';
    this.nuevoTelefono = '';
    this.modoDueno.set('buscar');
  }

  cerrarCambioDueno() {
    this.modoDueno.set('cerrado');
    this.resultados.set([]);
  }

  buscar() {
    if (this.busquedaTimer) clearTimeout(this.busquedaTimer);
    const q = this.busqueda.trim();
    if (q.length < 2) {
      this.resultados.set([]);
      return;
    }
    this.buscando.set(true);
    this.busquedaTimer = setTimeout(async () => {
      try {
        const res = await this.api.buscarClientes(q);
        if (this.busqueda.trim() === q) this.resultados.set(res.datos);
      } catch {
        // una búsqueda fallada no debería romper el formulario
      } finally {
        this.buscando.set(false);
      }
    }, 250);
  }

  elegirDueno(c: ClienteResumen) {
    const actual = this.vehiculo()?.cliente.id;
    this.duenoPendiente.set(c.id === actual ? null : c);
    this.cerrarCambioDueno();
  }

  async crearDueno() {
    const nombre = this.nuevoNombre.trim();
    if (nombre.length < 2) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      const c = await this.api.crearCliente({
        nombre,
        telefono: this.nuevoTelefono.trim() || null,
      });
      this.duenoPendiente.set(c);
      this.cerrarCambioDueno();
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    } finally {
      this.ocupado.set(false);
    }
  }

  async guardar(v: Vehiculo) {
    const patenteN = normalizarPatente(this.patente);
    const cambios: DatosEditarVehiculo = {};
    if (patenteN !== v.patente) cambios.patente = patenteN;
    if (this.tipo !== v.tipo) cambios.tipo = this.tipo;
    const marcaN = this.marca.trim() || null;
    if (marcaN !== (v.marca ?? null)) cambios.marca = marcaN;
    const modeloN = this.modelo.trim() || null;
    if (modeloN !== (v.modelo ?? null)) cambios.modelo = modeloN;
    const anioN = this.anio ?? null;
    if (anioN !== (v.anio ?? null)) cambios.anio = anioN;
    const kmN = this.km ?? null;
    if (kmN !== (v.km_actual ?? null)) cambios.km_actual = kmN;
    const pendiente = this.duenoPendiente();
    if (pendiente && pendiente.id !== v.cliente.id) cambios.cliente_id = pendiente.id;
    if (this.formatoLibre) cambios.formato_libre = true;

    if (Object.keys(cambios).length === 0) {
      this.editando.set(false);
      return;
    }

    this.ocupado.set(true);
    this.error.set('');
    this.patenteInvalida.set(false);
    try {
      const actualizado = await this.api.editarVehiculo(v.id, cambios);
      this.vehiculo.set(actualizado);
      this.duenoPendiente.set(null);
      this.editando.set(false);
    } catch (err) {
      const e = errorDe(err);
      if (e.detalles?.['patente']) this.patenteInvalida.set(true);
      this.error.set(e.mensaje);
    } finally {
      this.ocupado.set(false);
    }
  }
}

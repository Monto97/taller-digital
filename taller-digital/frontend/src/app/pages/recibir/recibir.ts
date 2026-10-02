import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, DatosNuevaOrden, abrirWhatsapp, errorDe } from '../../core/api.service';
import { Orden, TipoVehiculo, Vehiculo } from '../../core/modelos';
import { KmPipe, Patente, nombreVehiculo, normalizarPatente } from '../../shared/compartido';

type Paso = 'patente' | 'datos' | 'listo';

/**
 * Recibir un vehículo es la tarea más frecuente del mostrador, así que va en
 * pasos cortos: primero la patente; después solo lo que falta saber.
 */
@Component({
  selector: 'app-recibir',
  imports: [FormsModule, RouterLink, Patente, KmPipe],
  template: `
    <div class="contenedor angosto">
      @switch (paso()) {
        @case ('patente') {
          <form class="panel pila" (ngSubmit)="buscarPatente()">
            <h1>Recibir vehículo</h1>
            <div class="campo">
              <label for="patente">¿Qué patente tiene?</label>
              <input id="patente" name="patente" class="input patente-input" autocomplete="off"
                     autocapitalize="characters" placeholder="AB 123 CD" [(ngModel)]="patente" autofocus />
            </div>
            @if (error()) { <p class="aviso aviso-error" role="alert">{{ error() }}</p> }
            <button type="submit" class="btn btn-primario btn-ancho" [disabled]="!patente.trim() || ocupado()">
              {{ ocupado() ? 'Buscando…' : 'Seguir' }}
            </button>
          </form>
        }

        @case ('datos') {
          <form class="pila" (ngSubmit)="recibir()">
            <div class="panel pila">
              <div class="cabecera">
                <app-patente [valor]="patenteNormalizada()" [tipo]="vehiculo()?.tipo ?? tipo" [grande]="true" />
                <button type="button" class="btn-texto" (click)="volver()">Cambiar patente</button>
              </div>

              @if (vehiculo(); as v) {
                <div>
                  <h2>{{ nombre(v) }}</h2>
                  <p class="suave">
                    De {{ v.cliente.nombre }}
                    @if (v.km_actual) { · último registro {{ v.km_actual | km }} }
                  </p>
                </div>
                @if (v.orden_activa) {
                  <p class="aviso aviso-info">
                    Este vehículo ya está en el taller (orden n.º {{ v.orden_activa.numero }}).
                    <a [routerLink]="['/ordenes', v.orden_activa.id]">Ver la orden</a>
                  </p>
                }
              } @else {
                <p class="aviso aviso-info">Es la primera vez que viene. Cargá sus datos una sola vez y la próxima ya lo encontrás por la patente.</p>

                <div class="campo">
                  <span class="etiqueta" id="tipo-label">¿Es auto o moto?</span>
                  <div class="opciones" role="group" aria-labelledby="tipo-label">
                    <button type="button" class="opcion" [attr.aria-pressed]="tipo === 'auto'" (click)="tipo = 'auto'">Auto</button>
                    <button type="button" class="opcion" [attr.aria-pressed]="tipo === 'moto'" (click)="tipo = 'moto'">Moto</button>
                  </div>
                </div>

                <div class="fila fila-2">
                  <div class="campo">
                    <label for="marca">Marca</label>
                    <input id="marca" name="marca" class="input" placeholder="Fiat" [(ngModel)]="marca" />
                  </div>
                  <div class="campo">
                    <label for="modelo">Modelo</label>
                    <input id="modelo" name="modelo" class="input" placeholder="Cronos" [(ngModel)]="modelo" />
                  </div>
                </div>

                <div class="fila fila-2">
                  <div class="campo">
                    <label for="cliente">Nombre del dueño</label>
                    <input id="cliente" name="cliente" class="input" autocomplete="off" [(ngModel)]="clienteNombre" required />
                  </div>
                  <div class="campo">
                    <label for="telefono">Celular del dueño</label>
                    <input id="telefono" name="telefono" class="input" type="tel" inputmode="tel" placeholder="221 555-0143" [(ngModel)]="telefono" />
                    <span class="ayuda">Para avisarle por WhatsApp.</span>
                  </div>
                </div>
              }
            </div>

            @if (!vehiculo()?.orden_activa) {
              <div class="panel pila">
                <div class="campo">
                  <label for="motivo">¿Qué le pasa o qué hay que hacerle?</label>
                  <textarea id="motivo" name="motivo" class="textarea" placeholder="Ej: hace ruido al frenar, service de 10.000 km"
                            [(ngModel)]="motivo" required></textarea>
                </div>
                <div class="campo km">
                  <label for="km">Kilómetros</label>
                  <input id="km" name="km" class="input" type="number" inputmode="numeric" min="0" [(ngModel)]="km" />
                </div>
              </div>

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

              <button type="submit" class="btn btn-primario btn-ancho" [disabled]="!puedeRecibir() || ocupado()">
                {{ ocupado() ? 'Guardando…' : 'Recibir vehículo' }}
              </button>
            }
          </form>
        }

        @case ('listo') {
          @if (creada(); as o) {
            <div class="panel pila centrado">
              <app-patente [valor]="o.vehiculo.patente" [tipo]="o.vehiculo.tipo" [grande]="true" />
              <h1>Ya está en el taller</h1>
              <p class="suave">Orden n.º {{ o.numero }}. Aparece en el tablero como recibido.</p>

              @if (o.whatsapp_url) {
                <button type="button" class="btn btn-whatsapp btn-ancho" (click)="avisar(o)">
                  Avisarle a {{ o.cliente.nombre }} por WhatsApp
                </button>
              }
              <a [routerLink]="['/ordenes', o.id]" class="btn btn-oscuro btn-ancho">Ver la orden</a>
              <button type="button" class="btn-texto" (click)="reiniciar()">Recibir otro vehículo</button>
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    .pila { display: flex; flex-direction: column; gap: 16px; }
    .panel + .panel { margin-top: 0; }
    .cabecera { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .etiqueta { font-weight: 600; font-size: .95rem; }
    .patente-input {
      font: 700 2rem var(--fuente-angosta); letter-spacing: 3px; text-transform: uppercase;
      text-align: center; min-height: 72px;
    }
    .patente-input::placeholder { color: #c3c9ce; }
    .km { max-width: 220px; }
    .centrado { align-items: center; text-align: center; }
  `,
})
export class Recibir implements OnInit {
  private api = inject(ApiService);
  readonly nombre = nombreVehiculo;
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  paso = signal<Paso>('patente');
  vehiculo = signal<Vehiculo | null>(null);
  creada = signal<Orden | null>(null);
  ocupado = signal(false);
  error = signal('');
  patenteInvalida = signal(false);
  patenteNormalizada = signal('');

  patente = '';
  tipo: TipoVehiculo = 'auto';
  marca = '';
  modelo = '';
  clienteNombre = '';
  telefono = '';
  motivo = '';
  km: number | null = null;
  formatoLibre = false;

  ngOnInit() {
    // Viene desde la búsqueda del tablero con una patente que no existe.
    const desdeBusqueda = this.route.snapshot.queryParamMap.get('patente');
    if (desdeBusqueda) {
      this.patente = desdeBusqueda;
      this.buscarPatente();
    }
  }

  async buscarPatente() {
    const patente = normalizarPatente(this.patente);
    if (!patente) return;
    this.patenteNormalizada.set(patente);
    this.ocupado.set(true);
    this.error.set('');
    try {
      const vehiculo = await this.api.vehiculoPorPatente(patente);
      this.vehiculo.set(vehiculo);
      this.km = vehiculo.km_actual;
      this.paso.set('datos');
    } catch (err) {
      const e = errorDe(err);
      if (e.codigo === 'NO_ENCONTRADO') {
        this.vehiculo.set(null);
        this.paso.set('datos');
      } else {
        this.error.set(e.mensaje);
      }
    } finally {
      this.ocupado.set(false);
    }
  }

  puedeRecibir() {
    const motivoOk = this.motivo.trim().length >= 3;
    return this.vehiculo() ? motivoOk : motivoOk && this.clienteNombre.trim().length >= 2;
  }

  async recibir() {
    const v = this.vehiculo();
    const datos: DatosNuevaOrden = { motivo: this.motivo.trim(), km_ingreso: this.km || null };
    if (v) {
      datos.vehiculo_id = v.id;
    } else {
      datos.vehiculo = {
        patente: this.patenteNormalizada(),
        tipo: this.tipo,
        marca: this.marca.trim() || undefined,
        modelo: this.modelo.trim() || undefined,
        cliente: { nombre: this.clienteNombre.trim(), telefono: this.telefono.trim() || undefined },
        formato_libre: this.formatoLibre || undefined,
      };
    }

    this.ocupado.set(true);
    this.error.set('');
    try {
      this.creada.set(await this.api.crearOrden(datos));
      this.paso.set('listo');
    } catch (err) {
      const e = errorDe(err);
      const detallePatente = e.detalles?.['vehiculo.patente'];
      this.patenteInvalida.set(Boolean(detallePatente));
      this.error.set(detallePatente ? String(detallePatente) : e.mensaje);
    } finally {
      this.ocupado.set(false);
    }
  }

  async avisar(orden: Orden) {
    if (!orden.whatsapp_url) return;
    abrirWhatsapp(orden.whatsapp_url);
    this.api.registrarAviso(orden.id, 'recibido').catch(() => undefined);
  }

  volver() {
    this.paso.set('patente');
    this.error.set('');
  }

  reiniciar() {
    Object.assign(this, { patente: '', tipo: 'auto', marca: '', modelo: '', clienteNombre: '', telefono: '', motivo: '', km: null, formatoLibre: false });
    this.vehiculo.set(null);
    this.creada.set(null);
    this.paso.set('patente');
    this.router.navigate(['/recibir']);
  }
}

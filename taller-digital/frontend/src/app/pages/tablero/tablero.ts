import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorDe } from '../../core/api.service';
import { AuthService } from '../../core/auth';
import { Tablero as DatosTablero } from '../../core/modelos';
import { CuandoPipe, ETIQUETA_ESTADO, Patente, PesosPipe, normalizarPatente } from '../../shared/compartido';

type Columna = keyof DatosTablero['columnas'];

@Component({
  selector: 'app-tablero',
  imports: [FormsModule, RouterLink, Patente, PesosPipe, CuandoPipe],
  template: `
    <div class="contenedor">
      <div class="encabezado">
        <div>
          <h1>Hoy en el taller</h1>
          <p class="suave">{{ hoy }}</p>
        </div>

        <form class="buscar" (ngSubmit)="buscar()" role="search">
          <label for="buscar-patente" class="oculto">Buscar por patente</label>
          <input id="buscar-patente" name="patente" class="input" placeholder="Buscar patente"
                 autocomplete="off" autocapitalize="characters" [(ngModel)]="patente" />
          <button type="submit" class="btn btn-oscuro" [disabled]="!patente.trim()">Buscar</button>
        </form>
      </div>

      @if (error()) {
        <p class="aviso aviso-error" role="alert">{{ error() }}</p>
      }

      @if (datos(); as d) {
        @if (d.hay_ejemplos) {
          <div class="ejemplos aviso aviso-info" role="note">
            <p>
              <strong>Estos son autos de ejemplo</strong> para que veas cómo funciona.
              Abrí cualquiera para ver la orden, el presupuesto y el aviso por WhatsApp.
            </p>
            @if (esDueno()) {
              <button type="button" class="btn btn-oscuro" [disabled]="borrando()" (click)="borrarEjemplos()">
                {{ borrando() ? 'Borrando…' : 'Borrar ejemplos y empezar' }}
              </button>
            }
          </div>
        }

        <div class="resumen">
          <span><b>{{ d.resumen.en_taller }}</b> en el taller</span>
          <span><b>{{ d.resumen.listos }}</b> {{ d.resumen.listos === 1 ? 'listo' : 'listos' }} para retirar</span>
          <span><b>{{ d.resumen.presupuestos_sin_respuesta }}</b> esperando aprobación</span>
          <span><b>{{ d.resumen.entregados_hoy }}</b> {{ d.resumen.entregados_hoy === 1 ? 'entregado' : 'entregados' }} hoy</span>
        </div>

        @if (d.resumen.en_taller === 0) {
          <div class="vacio panel">
            <h2>No hay vehículos en el taller</h2>
            <p class="suave">Cuando llegue uno, cargalo acá y va a aparecer en este tablero.</p>
            <a routerLink="/recibir" class="btn btn-primario">Recibir vehículo</a>
          </div>
        } @else {
          <div class="columnas">
            @for (col of columnas; track col) {
              <section class="columna" [attr.aria-labelledby]="'col-' + col">
                <h2 [id]="'col-' + col" class="estado estado-{{ col }}">
                  {{ etiqueta[col] }} <span class="cuenta">{{ d.columnas[col].length }}</span>
                </h2>
                @for (t of d.columnas[col]; track t.id) {
                  <a class="tarjeta" [routerLink]="['/ordenes', t.id]" [style.--c]="colorDe(col)">
                    <div class="arriba">
                      <app-patente [valor]="t.patente" [tipo]="t.tipo" />
                      <span class="cuando">
                        @if (t.es_ejemplo) { <span class="marca-ejemplo">Ejemplo</span> }
                        {{ t.fecha_ingreso | cuando }}
                      </span>
                    </div>
                    <strong>{{ t.vehiculo || (t.tipo === 'moto' ? 'Moto' : 'Auto') }}</strong>
                    @if (t.motivo) { <span class="motivo">{{ t.motivo }}</span> }
                    <div class="abajo">
                      <span>{{ t.cliente }}</span>
                      @if (+t.total > 0) { <span class="total">{{ t.total | pesos }}</span> }
                    </div>
                  </a>
                } @empty {
                  <p class="nada">Ninguno</p>
                }
              </section>
            }
          </div>
        }
      } @else if (!error()) {
        <p class="cargando">Cargando el tablero…</p>
      }
    </div>
  `,
  styles: `
    .encabezado { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; justify-content: space-between; margin-bottom: 16px; }
    .buscar { display: flex; gap: 8px; width: 100%; max-width: 380px; }
    .buscar .input { text-transform: uppercase; font-family: var(--fuente-angosta); font-weight: 600; letter-spacing: 1px; }
    .buscar .input::placeholder { text-transform: none; font-family: var(--fuente); font-weight: 400; letter-spacing: 0; }
    .oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

    .resumen {
      display: flex; flex-wrap: wrap; gap: 8px 22px; margin-bottom: 18px;
      padding: 12px 16px; background: var(--superficie); border: 1px solid var(--linea); border-radius: 10px;
      color: var(--texto-suave);
    }
    .resumen b { color: var(--texto); font: 700 1.25rem var(--fuente-angosta); margin-right: 3px; }
    @media (max-width: 640px) { .resumen { display: grid; grid-template-columns: 1fr 1fr; } }

    .vacio { text-align: center; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px; }

    .columnas { display: grid; gap: 18px; }
    @media (min-width: 1000px) {
      .columnas { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; align-items: start; }
    }
    .columna h2 { font-size: .95rem; margin-bottom: 10px; width: 100%; }
    .cuenta { margin-left: auto; font-weight: 500; color: var(--texto-suave); }
    .nada { color: var(--gris); font-size: .9rem; padding: 4px 2px; }

    .tarjeta {
      display: flex; flex-direction: column; gap: 3px; margin-bottom: 10px; padding: 12px;
      background: var(--superficie); border: 1px solid var(--linea); border-top: 4px solid var(--c);
      border-radius: 8px; color: var(--texto); text-decoration: none;
    }
    .tarjeta:hover { border-color: var(--gris); border-top-color: var(--c); }
    .arriba { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
    .cuando { font-size: .8rem; color: var(--texto-suave); display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
    .marca-ejemplo {
      font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
      padding: 2px 7px; border-radius: 99px; background: var(--ambar-suave); color: var(--texto); border: 1px solid #f3d27d;
    }
    .ejemplos { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    .ejemplos p { margin: 0; flex: 1 1 320px; line-height: 1.4; }
    .motivo { font-size: .9rem; color: var(--texto-suave); line-height: 1.35; }
    .abajo { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; font-size: .85rem; color: var(--texto-suave); }
    .total { font-weight: 600; color: var(--texto); }
  `,
})
export class Tablero implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private intervalo?: ReturnType<typeof setInterval>;

  readonly columnas: Columna[] = ['recibido', 'diagnostico', 'esperando_aprobacion', 'en_reparacion', 'listo'];
  readonly etiqueta = ETIQUETA_ESTADO;
  readonly hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

  datos = signal<DatosTablero | null>(null);
  error = signal('');
  patente = '';
  borrando = signal(false);
  /** Los ejemplos los borra solo el dueño (el backend también lo exige). */
  esDueno = () => this.auth.usuario()?.rol === 'dueno';

  ngOnInit() {
    this.cargar();
    // Se actualiza solo, por si otro mecánico movió algo.
    this.intervalo = setInterval(() => this.cargar(), 60_000);
  }

  ngOnDestroy() {
    clearInterval(this.intervalo);
  }

  async cargar() {
    try {
      this.datos.set(await this.api.tablero());
      this.error.set('');
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    }
  }

  async borrarEjemplos() {
    if (!confirm('¿Borrar los autos de ejemplo? Lo que cargaste vos no se toca.')) return;
    this.borrando.set(true);
    try {
      await this.api.borrarEjemplos();
      await this.cargar();
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    } finally {
      this.borrando.set(false);
    }
  }

  colorDe(col: Columna) {
    const colores: Record<Columna, string> = {
      recibido: 'var(--gris)', diagnostico: 'var(--azul)', esperando_aprobacion: 'var(--ambar)',
      en_reparacion: 'var(--naranja)', listo: 'var(--verde)',
    };
    return colores[col];
  }

  /** Si la patente existe va a su orden en curso o a su ficha; si no, ofrece recibirlo. */
  async buscar() {
    const patente = normalizarPatente(this.patente);
    if (!patente) return;
    try {
      const vehiculo = await this.api.vehiculoPorPatente(patente);
      if (vehiculo.orden_activa) this.router.navigate(['/ordenes', vehiculo.orden_activa.id]);
      else this.router.navigate(['/vehiculos', vehiculo.id]);
    } catch (err) {
      if (errorDe(err).codigo === 'NO_ENCONTRADO') this.router.navigate(['/recibir'], { queryParams: { patente } });
      else this.error.set(errorDe(err).mensaje);
    }
  }
}

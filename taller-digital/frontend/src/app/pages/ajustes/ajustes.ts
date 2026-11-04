import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, errorDe } from '../../core/api.service';
import { AuthService } from '../../core/auth';
import { DatosTaller, MpEstado } from '../../core/modelos';
import { CuandoPipe } from '../../shared/compartido';

/**
 * Pantalla "Ajustes del taller":
 *   - Datos del taller (nombre, teléfono, dirección). Solo el dueño los edita.
 *   - Conexión con Mercado Pago. Al tocar "Conectar", el back arma la URL de
 *     autorización y el navegador va a MP. Después de autorizar, MP redirige
 *     a /ajustes?conectado=ok|error.
 */
@Component({
  selector: 'app-ajustes',
  imports: [CuandoPipe, FormsModule],
  template: `
    <div class="contenedor angosto">
      <header class="encabezado">
        <h1>Ajustes del taller</h1>
        <p class="suave">Los datos del taller y los servicios que usa.</p>
      </header>

      @if (aviso(); as a) {
        <p class="aviso aviso-{{ a.tipo }}" role="status">{{ a.texto }}</p>
      }

      @if (error()) {
        <p class="aviso aviso-error" role="alert">{{ error() }}</p>
      }

      <section class="panel pila" aria-labelledby="titulo-datos">
        <h2 id="titulo-datos">Datos del taller</h2>

        @if (taller()) {
          @if (puedeEditar()) {
            <form class="pila" (ngSubmit)="guardarTaller()">
              @if (errorTaller()) {
                <p class="aviso aviso-error" role="alert">{{ errorTaller() }}</p>
              }
              @if (guardado()) {
                <p class="aviso aviso-ok" role="status">Listo, se guardaron los cambios.</p>
              }
              <div class="campo">
                <label for="taller-nombre">Nombre del taller</label>
                <input id="taller-nombre" name="nombre" class="input" autocomplete="organization" maxlength="120"
                       [(ngModel)]="nombre" (ngModelChange)="guardado.set(false)" required />
                <span class="ayuda">Aparece arriba de todo, en los PDF y en el link que recibe el cliente.</span>
              </div>
              <div class="campo">
                <label for="taller-telefono">Teléfono (opcional)</label>
                <input id="taller-telefono" name="telefono" class="input" type="tel" inputmode="tel" maxlength="30"
                       placeholder="2241 15 00-0000" [(ngModel)]="telefono" (ngModelChange)="guardado.set(false)" />
                <span class="ayuda">Para que tus clientes te escriban desde el link de seguimiento.</span>
              </div>
              <div class="campo">
                <label for="taller-direccion">Dirección (opcional)</label>
                <input id="taller-direccion" name="direccion" class="input" autocomplete="street-address" maxlength="200"
                       [(ngModel)]="direccion" (ngModelChange)="guardado.set(false)" />
              </div>
              <div class="acciones">
                <button type="submit" class="btn btn-primario" [disabled]="guardando() || !hayCambios()">
                  {{ guardando() ? 'Guardando…' : 'Guardar cambios' }}
                </button>
              </div>
            </form>
          } @else {
            <dl class="datos">
              <div><dt>Nombre</dt><dd>{{ taller()!.nombre }}</dd></div>
              <div><dt>Teléfono</dt><dd>{{ taller()!.telefono || '—' }}</dd></div>
              <div><dt>Dirección</dt><dd>{{ taller()!.direccion || '—' }}</dd></div>
            </dl>
            <p class="suave">Solo el dueño del taller puede cambiar estos datos.</p>
          }
        } @else if (!errorTaller()) {
          <p class="cargando">Cargando…</p>
        } @else {
          <p class="aviso aviso-error" role="alert">{{ errorTaller() }}</p>
        }
      </section>

      <section class="panel pila">
        <div class="titulo-fila">
          <h2>Mercado Pago</h2>
          @if (estado()?.conectado) {
            <span class="chip chip-ok">Conectado</span>
          } @else if (estado()?.configurado) {
            <span class="chip">Sin conectar</span>
          }
        </div>

        @if (estado(); as e) {
          @if (!e.configurado) {
            <p>El servidor todavía no tiene las credenciales de Mercado Pago cargadas.</p>
            <p class="suave">Pedile al admin que configure <code>MP_CLIENT_ID</code> y <code>MP_CLIENT_SECRET</code>.</p>
          } @else if (!e.conectado) {
            <p>Conectá tu cuenta de Mercado Pago para que los clientes puedan pagar las órdenes directamente a tu caja.</p>
            <p class="suave">La plata va a tu cuenta de MP: nosotros nunca la tocamos.</p>
            <button type="button" class="btn btn-primario" [disabled]="ocupado()" (click)="conectar()">
              {{ ocupado() ? 'Abriendo…' : 'Conectar Mercado Pago' }}
            </button>
          } @else {
            <dl class="datos">
              <div><dt>Cuenta MP</dt><dd>#{{ e.mp_user_id }}</dd></div>
              <div><dt>Modo</dt><dd>{{ e.live_mode ? 'Producción' : 'Pruebas (sandbox)' }}</dd></div>
              <div><dt>Conectado</dt><dd>{{ e.conectado_at | cuando }}</dd></div>
            </dl>
            <div class="acciones">
              <button type="button" class="btn btn-borde" [disabled]="ocupado()" (click)="conectar()">
                Volver a conectar
              </button>
              <button type="button" class="btn-peligro" [disabled]="ocupado()" (click)="desconectar()">
                Desconectar cuenta
              </button>
            </div>
          }
        } @else {
          <p class="cargando">Cargando…</p>
        }
      </section>
    </div>
  `,
  styles: `
    .encabezado { margin-bottom: 18px; }
    .encabezado h1 { margin-bottom: 4px; }
    .pila { display: flex; flex-direction: column; gap: 14px; }
    .pila > * { margin: 0; }
    .titulo-fila { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .titulo-fila h2 { margin: 0; }
    .chip {
      padding: 3px 10px; border-radius: 999px; font-size: .85rem; font-weight: 600;
      background: var(--fondo); color: var(--texto-suave); border: 1px solid var(--linea);
    }
    .chip-ok { background: #e7f4ec; color: var(--verde-oscuro); border-color: #bfe0cc; }
    .datos { margin: 0; display: grid; gap: 6px; }
    .datos > div { display: grid; grid-template-columns: 140px 1fr; gap: 10px; }
    .datos dt { color: var(--texto-suave); margin: 0; }
    .datos dd { margin: 0; font-weight: 500; }
    .acciones { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    code { background: var(--fondo); padding: 1px 6px; border-radius: 4px; font-size: .9em; }
  `,
})
export class AjustesPagina implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private ruta = inject(ActivatedRoute);

  estado = signal<MpEstado | null>(null);
  ocupado = signal(false);
  error = signal('');
  aviso = signal<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);

  // Datos del taller
  taller = signal<DatosTaller | null>(null);
  puedeEditar = computed(() => this.auth.usuario()?.rol === 'dueno');
  nombre = '';
  telefono = '';
  direccion = '';
  guardando = signal(false);
  guardado = signal(false);
  errorTaller = signal('');

  async ngOnInit() {
    void this.cargarTaller();
    // El callback de MP nos devuelve con ?conectado=ok|error[&motivo=...]
    const qp = this.ruta.snapshot.queryParamMap;
    if (qp.get('conectado') === 'ok') {
      this.aviso.set({ tipo: 'ok', texto: 'Mercado Pago quedó conectado. Ya podés cobrar online.' });
    } else if (qp.get('conectado') === 'error') {
      const motivo = qp.get('motivo') || 'No se pudo completar la conexión.';
      this.aviso.set({ tipo: 'error', texto: `No se conectó: ${motivo}` });
    }
    await this.cargar();
  }

  private async cargarTaller() {
    try {
      this.mostrarTaller(await this.api.taller());
    } catch (err) {
      this.errorTaller.set(errorDe(err).mensaje);
    }
  }

  private mostrarTaller(t: DatosTaller) {
    this.taller.set(t);
    this.nombre = t.nombre;
    this.telefono = t.telefono ?? '';
    this.direccion = t.direccion ?? '';
  }

  hayCambios() {
    const t = this.taller();
    if (!t || this.nombre.trim().length < 2) return false;
    return (
      this.nombre.trim() !== t.nombre ||
      this.telefono.trim() !== (t.telefono ?? '') ||
      this.direccion.trim() !== (t.direccion ?? '')
    );
  }

  async guardarTaller() {
    if (!this.hayCambios()) return;
    this.guardando.set(true);
    this.guardado.set(false);
    this.errorTaller.set('');
    try {
      const t = await this.api.editarTaller({
        nombre: this.nombre.trim(),
        telefono: this.telefono.trim() || null,
        direccion: this.direccion.trim() || null,
      });
      this.mostrarTaller(t);
      this.auth.actualizarTaller(t);
      this.guardado.set(true);
    } catch (err) {
      const e = errorDe(err);
      const detalle = e.codigo === 'VALIDACION' ? Object.values(e.detalles ?? {})[0] : undefined;
      this.errorTaller.set(detalle ? String(detalle) : e.mensaje);
    } finally {
      this.guardando.set(false);
    }
  }

  private async cargar() {
    try {
      this.estado.set(await this.api.mpEstado());
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    }
  }

  async conectar() {
    this.ocupado.set(true);
    this.error.set('');
    try {
      const { url } = await this.api.mpUrl();
      window.location.href = url;
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
      this.ocupado.set(false);
    }
  }

  async desconectar() {
    if (!confirm('¿Desconectar la cuenta de Mercado Pago? Los links de pago nuevos van a dejar de funcionar.')) return;
    this.ocupado.set(true);
    this.error.set('');
    try {
      await this.api.mpDesconectar();
      this.aviso.set({ tipo: 'info', texto: 'Se desconectó la cuenta de Mercado Pago.' });
      await this.cargar();
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    } finally {
      this.ocupado.set(false);
    }
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ApiService, errorDe } from '../../core/api.service';
import { MpEstado } from '../../core/modelos';
import { CuandoPipe } from '../../shared/compartido';

/**
 * Pantalla "Ajustes del taller". Por ahora solo tiene la conexión con Mercado Pago.
 * Al tocar "Conectar", el back arma la URL de autorización y el navegador va a MP.
 * Después de autorizar, MP redirige a /ajustes?conectado=ok|error.
 */
@Component({
  selector: 'app-ajustes',
  imports: [CuandoPipe],
  template: `
    <div class="contenedor angosto">
      <header class="encabezado">
        <h1>Ajustes del taller</h1>
        <p class="suave">Conectá los servicios que usa el taller.</p>
      </header>

      @if (aviso(); as a) {
        <p class="aviso aviso-{{ a.tipo }}" role="status">{{ a.texto }}</p>
      }

      @if (error()) {
        <p class="aviso aviso-error" role="alert">{{ error() }}</p>
      }

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
  private ruta = inject(ActivatedRoute);

  estado = signal<MpEstado | null>(null);
  ocupado = signal(false);
  error = signal('');
  aviso = signal<{ tipo: 'ok' | 'error' | 'info'; texto: string } | null>(null);

  async ngOnInit() {
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

import { Component, Injectable, computed, inject, signal } from '@angular/core';

/** Evento que dispara Chrome (Android y escritorio) cuando el sitio se puede instalar. */
interface EventoInstalacion extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const CLAVE_DESCARTE = 'taller-digital.instalar-descartado';
const DIAS_SIN_MOSTRAR = 7;

/**
 * Detecta si se puede ofrecer instalar el sistema como app.
 * Se crea al arrancar la aplicación (ver App) porque Chrome avisa una sola vez,
 * apenas carga la página, y si nadie escucha en ese momento el aviso se pierde.
 */
@Injectable({ providedIn: 'root' })
export class InstalacionService {
  private evento = signal<EventoInstalacion | null>(null);
  private descartado = signal(descartadoHacepoco());
  private instalada = signal(estaInstalada());

  private readonly esIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  /** 'android': hay botón Instalar. 'ios': hay que explicar los pasos. null: no mostrar nada. */
  readonly modo = computed<'android' | 'ios' | null>(() => {
    if (this.instalada() || this.descartado()) return null;
    if (this.evento()) return 'android';
    if (this.esIos) return 'ios';
    return null;
  });

  constructor() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // en vez del cartel genérico del navegador, mostramos el nuestro
      this.evento.set(e as EventoInstalacion);
    });
    window.addEventListener('appinstalled', () => {
      this.instalada.set(true);
      this.evento.set(null);
    });
  }

  async instalar() {
    const e = this.evento();
    if (!e) return;
    await e.prompt();
    const { outcome } = await e.userChoice;
    this.evento.set(null);
    if (outcome === 'accepted') this.instalada.set(true);
  }

  descartar() {
    localStorage.setItem(CLAVE_DESCARTE, String(Date.now()));
    this.descartado.set(true);
  }
}

function estaInstalada() {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

function descartadoHacepoco() {
  const cuando = Number(localStorage.getItem(CLAVE_DESCARTE) || 0);
  return Date.now() - cuando < DIAS_SIN_MOSTRAR * 86_400_000;
}

/** Aviso que aparece debajo de la barra superior mientras el sistema no esté instalado. */
@Component({
  selector: 'app-aviso-instalar',
  template: `
    @switch (instalacion.modo()) {
      @case ('android') {
        <div class="aviso-instalar" role="region" aria-label="Instalar la app">
          <img src="icono-192.png" alt="" width="44" height="44" />
          <p><strong>Tené Taller Digital como una app</strong> Queda un ícono en tu celular y abre directo, sin buscar el link.</p>
          <div class="botones">
            <button type="button" class="btn btn-primario" (click)="instalacion.instalar()">Instalar</button>
            <button type="button" class="btn-texto" (click)="instalacion.descartar()">Ahora no</button>
          </div>
        </div>
      }
      @case ('ios') {
        <div class="aviso-instalar" role="region" aria-label="Agregar a la pantalla de inicio">
          <img src="icono-192.png" alt="" width="44" height="44" />
          <p>
            <strong>Tené Taller Digital como una app</strong>
            Tocá <span class="compartir" aria-label="el botón compartir">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span> abajo y después <strong class="en-linea">Agregar a inicio</strong>.
          </p>
          <div class="botones">
            <button type="button" class="btn-texto" (click)="instalacion.descartar()">Entendido</button>
          </div>
        </div>
      }
    }
  `,
  styles: `
    .aviso-instalar {
      max-width: var(--ancho-max); margin: 12px auto 0; padding: 12px 14px;
      display: flex; align-items: center; gap: 12px 14px; flex-wrap: wrap;
      background: var(--superficie); border: 1.5px solid var(--ambar); border-radius: 10px;
    }
    @media (max-width: 1212px) { .aviso-instalar { margin: 12px 16px 0; } }
    img { border-radius: 10px; flex: none; }
    p { flex: 1 1 220px; font-size: .95rem; color: var(--texto-suave); }
    p > strong:first-child { display: block; color: var(--texto); }
    .en-linea { color: var(--texto); }
    .compartir { display: inline-flex; vertical-align: -3px; color: var(--azul); }
    .botones { display: flex; align-items: center; gap: 6px; }
    .botones .btn { min-height: 46px; }
  `,
})
export class AvisoInstalar {
  protected instalacion = inject(InstalacionService);
}

import { Injectable, computed, signal } from '@angular/core';

/** Evento de Chrome/Android para ofrecer instalar la app (no está en los tipos de TypeScript). */
interface EventoInstalacion extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const CLAVE_CERRADO = 'taller-digital.aviso-instalar-cerrado';
const DIAS_SIN_MOSTRAR = 14;

// Se escucha apenas carga el archivo: Chrome puede disparar el evento antes de que arranque Angular.
const eventoPendiente = signal<EventoInstalacion | null>(null);
const instalada = signal(esModoApp());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // en vez de la barrita de Chrome, mostramos nuestro aviso
    eventoPendiente.set(e as EventoInstalacion);
  });
  window.addEventListener('appinstalled', () => {
    eventoPendiente.set(null);
    instalada.set(true);
  });
}

/** Registra el service worker que pide Chrome para ofrecer la instalación. */
export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const registrar = () => navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker:', err));
  if (document.readyState === 'complete') registrar();
  else window.addEventListener('load', registrar);
}

@Injectable({ providedIn: 'root' })
export class InstalarApp {
  private cerrado = signal(cerradoHacePoco());

  /** iPhone/iPad: Apple no permite un botón de instalar, hay que explicar los pasos. */
  readonly esIos = esIos();
  readonly puedeInstalar = computed(() => eventoPendiente() !== null);

  readonly mostrarAviso = computed(
    () => !instalada() && !this.cerrado() && (this.puedeInstalar() || this.esIos),
  );

  async instalar() {
    const evento = eventoPendiente();
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    eventoPendiente.set(null); // el evento se usa una sola vez
    if (outcome === 'dismissed') this.cerrar();
  }

  cerrar() {
    try {
      localStorage.setItem(CLAVE_CERRADO, String(Date.now()));
    } catch {
      // sin localStorage, el aviso vuelve a aparecer la próxima vez; no pasa nada
    }
    this.cerrado.set(true);
  }
}

function esModoApp() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function esIos() {
  if (typeof navigator === 'undefined') return false;
  // Los iPad nuevos se presentan como Mac, pero con pantalla táctil.
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function cerradoHacePoco() {
  try {
    const cuando = Number(localStorage.getItem(CLAVE_CERRADO));
    return cuando > 0 && Date.now() - cuando < DIAS_SIN_MOSTRAR * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

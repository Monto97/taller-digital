import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, errorDe } from '../../core/api.service';
import { AuthService } from '../../core/auth';
import { AdminResumen, AdminTaller, UsoTaller } from '../../core/modelos';
import { CuandoPipe, PesosPipe } from '../../shared/compartido';

const USO: Record<UsoTaller, { texto: string; ayuda: string }> = {
  activo: { texto: 'Usándolo', ayuda: 'Movió órdenes en los últimos 3 días' },
  poco_uso: { texto: 'Poco uso', ayuda: 'Su última actividad fue hace entre 4 y 14 días' },
  inactivo: { texto: 'Dejó de usarlo', ayuda: 'Más de 14 días sin actividad' },
  sin_arrancar: { texto: 'Sin arrancar', ayuda: 'Todavía no cargó ninguna orden' },
};

/** Contraseña inicial fácil de dictar por teléfono: "taller-4821-7395". */
function generarClave() {
  const n = () => String(Math.floor(1000 + Math.random() * 9000));
  return `taller-${n()}-${n()}`;
}

@Component({
  selector: 'app-admin',
  imports: [FormsModule, PesosPipe, CuandoPipe],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  /** Tu propio taller no se puede deshabilitar desde acá: te dejarías afuera. */
  miTaller = computed(() => this.auth.taller()?.id);

  resumen = signal<AdminResumen | null>(null);
  talleres = signal<AdminTaller[]>([]);
  error = signal('');
  ocupado = signal(false);

  // Alta de taller
  mostrarAlta = signal(false);
  errorAlta = signal('');
  creado = signal<{ nombre: string; email: string; clave: string; telefono: string } | null>(null);
  alta = { taller: '', telefono: '', direccion: '', dueno: '', email: '', clave: generarClave() };

  readonly uso = USO;

  /** Se registró en los últimos 3 días: para llamarlo mientras está probando. */
  esNuevo(t: AdminTaller) {
    return Date.now() - new Date(t.created_at).getTime() < 3 * 86_400_000;
  }

  /** Porcentaje de presupuestos enviados que se aprobaron. */
  tasaAprobacion = computed(() => {
    const p = this.resumen()?.presupuestos;
    return p && p.enviados ? Math.round((p.aprobados / p.enviados) * 100) : null;
  });

  /** De los aprobados, cuántos los aprobó el cliente solo desde el link. */
  tasaPorLink = computed(() => {
    const p = this.resumen()?.presupuestos;
    return p && p.aprobados ? Math.round((p.aprobados_por_link / p.aprobados) * 100) : null;
  });

  maximoDia = computed(() => Math.max(1, ...(this.resumen()?.ordenes_por_dia.map((d) => d.ordenes) ?? [0])));

  ngOnInit() {
    this.cargar();
  }

  async cargar() {
    try {
      const [resumen, talleres] = await Promise.all([this.api.adminResumen(), this.api.adminTalleres()]);
      this.resumen.set(resumen);
      this.talleres.set(talleres);
      this.error.set('');
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    }
  }

  altura(ordenes: number) {
    return `${Math.max(3, (ordenes / this.maximoDia()) * 100)}%`;
  }

  etiquetaDia(dia: string) {
    const [, mes, d] = dia.split('-');
    return `${Number(d)}/${Number(mes)}`;
  }

  async habilitar(t: AdminTaller, activo: boolean) {
    if (!activo && !confirm(`¿Deshabilitar "${t.nombre}"? No va a poder entrar hasta que lo vuelvas a habilitar.`)) return;
    this.ocupado.set(true);
    try {
      const actualizado = await this.api.adminHabilitar(t.id, activo);
      this.talleres.update((lista) => lista.map((x) => (x.id === t.id ? actualizado : x)));
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    } finally {
      this.ocupado.set(false);
    }
  }

  abrirAlta() {
    this.creado.set(null);
    this.errorAlta.set('');
    this.alta = { taller: '', telefono: '', direccion: '', dueno: '', email: '', clave: generarClave() };
    this.mostrarAlta.set(true);
  }

  nuevaClave() {
    this.alta.clave = generarClave();
  }

  puedeCrear() {
    const a = this.alta;
    return a.taller.trim().length >= 2 && a.dueno.trim().length >= 2 && a.email.includes('@') && a.clave.length >= 8;
  }

  async crear() {
    const a = this.alta;
    this.ocupado.set(true);
    this.errorAlta.set('');
    try {
      const res = await this.api.adminCrearTaller({
        taller: { nombre: a.taller.trim(), telefono: a.telefono.trim() || undefined, direccion: a.direccion.trim() || undefined },
        usuario: { nombre: a.dueno.trim(), email: a.email.trim(), password: a.clave },
      });
      this.creado.set({ nombre: res.taller.nombre, email: res.usuario.email, clave: a.clave, telefono: a.telefono });
      this.mostrarAlta.set(false);
      this.cargar();
    } catch (err) {
      const e = errorDe(err);
      const detalle = e.detalles ? Object.values(e.detalles)[0] : null;
      this.errorAlta.set(detalle ? String(detalle) : e.mensaje);
    } finally {
      this.ocupado.set(false);
    }
  }

  /** Mensaje de bienvenida con el link y los datos de ingreso. */
  mensajeBienvenida() {
    const c = this.creado();
    if (!c) return '';
    return `¡Hola! Ya tenés tu cuenta de Taller Digital para ${c.nombre}.\n\n` +
      `Entrá desde acá: ${location.origin}\nEmail: ${c.email}\nContraseña: ${c.clave}\n\n` +
      'Cuando entres desde el celular te va a ofrecer instalarlo como app.';
  }

  linkBienvenida() {
    const c = this.creado();
    if (!c?.telefono) return null;
    let tel = c.telefono.replace(/\D/g, '').replace(/^0/, '');
    if (!tel.startsWith('54')) {
      // Quita el "15" de celulares y agrega 549, igual que el backend.
      if (tel.length === 12) {
        for (const area of [2, 3, 4]) {
          if (tel.slice(area, area + 2) === '15') { tel = tel.slice(0, area) + tel.slice(area + 2); break; }
        }
      }
      if (tel.length === 10) tel = `549${tel}`;
    }
    return `https://wa.me/${tel}?text=${encodeURIComponent(this.mensajeBienvenida())}`;
  }

  async copiarBienvenida() {
    try {
      await navigator.clipboard.writeText(this.mensajeBienvenida());
    } catch {
      /* si el navegador no deja copiar, el mensaje queda visible para copiarlo a mano */
    }
  }
}

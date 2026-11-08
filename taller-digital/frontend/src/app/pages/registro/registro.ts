import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorDe } from '../../core/api.service';
import { AuthService } from '../../core/auth';

@Component({
  selector: 'app-registro',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="fondo">
      <form class="caja" (ngSubmit)="registrar()">
        <div class="marca">
          <span class="logo" aria-hidden="true">TD</span>
          <span>Taller Digital</span>
        </div>

        <div class="titulo">
          <h1>Probá Taller Digital gratis</h1>
          <p class="suave">Creá la cuenta de tu taller en un minuto. El primer mes es gratis y no te pedimos tarjeta.</p>
        </div>

        @if (error()) {
          <p class="aviso aviso-error" role="alert">{{ error() }}</p>
        }

        <fieldset>
          <legend>Tu taller</legend>
          <div class="campo">
            <label for="taller-nombre">Nombre del taller</label>
            <input id="taller-nombre" name="tallerNombre" class="input" autocomplete="organization"
                   [(ngModel)]="tallerNombre" required />
          </div>
          <div class="campo">
            <label for="taller-telefono">WhatsApp del taller</label>
            <input id="taller-telefono" name="tallerTelefono" class="input" type="tel" inputmode="tel"
                   autocomplete="tel" placeholder="221 15 555-0000" [(ngModel)]="tallerTelefono" required />
            <span class="ayuda">Para que tus clientes te escriban desde el link de seguimiento.</span>
          </div>
          <div class="campo">
            <label for="taller-direccion">Dirección (opcional)</label>
            <input id="taller-direccion" name="tallerDireccion" class="input" autocomplete="street-address"
                   [(ngModel)]="tallerDireccion" />
          </div>
        </fieldset>

        <fieldset>
          <legend>Tus datos</legend>
          <div class="campo">
            <label for="nombre">Tu nombre</label>
            <input id="nombre" name="nombre" class="input" autocomplete="name" [(ngModel)]="nombre" required />
          </div>
          <div class="campo">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" class="input" autocomplete="username"
                   [(ngModel)]="email" required />
            <span class="ayuda">Lo vas a usar para ingresar.</span>
          </div>
          <div class="campo">
            <label for="password">Contraseña</label>
            <input id="password" name="password" type="password" class="input" autocomplete="new-password"
                   minlength="8" [(ngModel)]="password" required />
            <span class="ayuda">Al menos 8 caracteres.</span>
          </div>
        </fieldset>

        <p class="aviso aviso-info">
          Vas a entrar con algunos autos de ejemplo para que veas cómo funciona. Los borrás con un toque cuando quieras.
        </p>

        <button type="submit" class="btn btn-primario btn-ancho" [disabled]="enviando() || !completo()">
          {{ enviando() ? 'Creando tu taller…' : 'Crear mi taller gratis' }}
        </button>

        <p class="pie suave">¿Ya tenés cuenta? <a routerLink="/ingresar">Ingresá</a></p>
      </form>
    </div>
  `,
  styles: `
    .fondo { min-height: 100vh; display: grid; place-items: center; padding: 20px; background: var(--grafito); }
    .caja {
      width: 100%; max-width: 440px; background: var(--superficie); border-radius: 12px;
      padding: 28px 24px; display: flex; flex-direction: column; gap: 18px;
    }
    .marca { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.05rem; }
    .titulo { display: flex; flex-direction: column; gap: 6px; }
    .titulo p { margin: 0; }
    .aviso { margin: 0; }
    .logo {
      width: 34px; height: 34px; border-radius: 7px; background: var(--ambar);
      display: grid; place-items: center; font: 700 16px var(--fuente-angosta);
    }
    fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    legend { font-weight: 700; font-size: 1.05rem; margin-bottom: 4px; padding: 0; }
    .pie { text-align: center; margin: 0; }
  `,
})
export class Registro {
  private auth = inject(AuthService);
  private router = inject(Router);

  tallerNombre = '';
  tallerTelefono = '';
  tallerDireccion = '';
  nombre = '';
  email = '';
  password = '';
  enviando = signal(false);
  error = signal('');

  completo() {
    return (
      this.tallerNombre.trim() && this.tallerTelefono.trim() && this.nombre.trim() && this.email.trim() &&
      this.password.length >= 8
    );
  }

  async registrar() {
    this.enviando.set(true);
    this.error.set('');
    try {
      await this.auth.registro({
        taller: {
          nombre: this.tallerNombre.trim(),
          telefono: this.tallerTelefono.trim(),
          direccion: this.tallerDireccion.trim() || undefined,
        },
        usuario: { nombre: this.nombre.trim(), email: this.email.trim(), password: this.password },
        con_ejemplos: true,
      });
      this.router.navigate(['/']);
    } catch (err) {
      // Si es un error de validación, mostramos el primer campo con problema (ej. "Email inválido.").
      const e = errorDe(err);
      const detalle = e.codigo === 'VALIDACION' ? Object.values(e.detalles ?? {})[0] : undefined;
      this.error.set(detalle ? String(detalle) : e.mensaje);
    } finally {
      this.enviando.set(false);
    }
  }
}

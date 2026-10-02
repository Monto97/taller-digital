import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorDe } from '../../core/api.service';
import { AuthService } from '../../core/auth';

@Component({
  selector: 'app-ingresar',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="fondo">
      <form class="caja" (ngSubmit)="ingresar()">
        <div class="marca">
          <span class="logo" aria-hidden="true">TD</span>
          <span>Taller Digital</span>
        </div>

        <h1>Ingresá a tu taller</h1>

        @if (error()) {
          <p class="aviso aviso-error" role="alert">{{ error() }}</p>
        }

        <div class="campo">
          <label for="email">Email</label>
          <input id="email" name="email" type="email" class="input" autocomplete="username"
                 [(ngModel)]="email" required />
        </div>

        <div class="campo">
          <label for="password">Contraseña</label>
          <input id="password" name="password" type="password" class="input" autocomplete="current-password"
                 [(ngModel)]="password" required />
        </div>

        <button type="submit" class="btn btn-primario btn-ancho" [disabled]="enviando() || !email || !password">
          {{ enviando() ? 'Ingresando…' : 'Ingresar' }}
        </button>

        <p class="pie suave">¿Todavía no tenés cuenta? <a routerLink="/registro">Creá tu taller</a></p>
      </form>
    </div>
  `,
  styles: `
    .fondo { min-height: 100vh; display: grid; place-items: center; padding: 20px; background: var(--grafito); }
    .caja {
      width: 100%; max-width: 400px; background: var(--superficie); border-radius: 12px;
      padding: 28px 24px; display: flex; flex-direction: column; gap: 18px;
    }
    .marca { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.05rem; }
    .pie { text-align: center; margin: 0; }
    .logo {
      width: 34px; height: 34px; border-radius: 7px; background: var(--ambar);
      display: grid; place-items: center; font: 700 16px var(--fuente-angosta);
    }
  `,
})
export class Ingresar {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  enviando = signal(false);
  error = signal('');

  async ingresar() {
    this.enviando.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.email.trim(), this.password);
      this.router.navigate(['/']);
    } catch (err) {
      this.error.set(errorDe(err).mensaje);
    } finally {
      this.enviando.set(false);
    }
  }
}

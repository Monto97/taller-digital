import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth';
import { AvisoInstalar } from '../core/instalacion';

@Component({
  selector: 'app-marco',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AvisoInstalar],
  template: `
    <header class="barra">
      <div class="interior">
        <a routerLink="/" class="marca" aria-label="Ir al tablero">
          <span class="logo" aria-hidden="true">TD</span>
          <span class="nombre">{{ auth.taller()?.nombre }}</span>
        </a>

        <nav class="nav" aria-label="Principal">
          <a routerLink="/" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: true }">Tablero</a>
          @if (auth.esAdmin()) {
            <a routerLink="/admin" routerLinkActive="activo">Admin</a>
          }
        </nav>

        <a routerLink="/recibir" class="btn btn-primario recibir">Recibir vehículo</a>

        @if (auth.esAdmin()) {
          <a routerLink="/admin" class="admin-movil">Admin</a>
        }
        <button type="button" class="salir" (click)="auth.salir()">Salir</button>
      </div>
    </header>

    <app-aviso-instalar />

    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    .barra { background: var(--grafito); color: #fff; position: sticky; top: 0; z-index: 10; }
    .interior {
      max-width: var(--ancho-max); margin: 0 auto; padding: 10px 16px;
      display: flex; align-items: center; gap: 18px;
    }
    .marca { display: flex; align-items: center; gap: 10px; color: #fff; text-decoration: none; min-width: 0; }
    .logo {
      width: 34px; height: 34px; border-radius: 7px; flex: none;
      background: var(--ambar); color: var(--grafito);
      display: grid; place-items: center; font: 700 16px var(--fuente-angosta);
    }
    .nombre { font-weight: 700; font-size: 1.05rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nav { display: flex; gap: 4px; margin-right: auto; }
    .nav a {
      color: #c9d1d6; text-decoration: none; font-weight: 500;
      padding: 10px 12px; border-radius: 6px;
    }
    .nav a.activo { color: #fff; background: var(--grafito-2); box-shadow: inset 0 -3px 0 var(--ambar); }
    .recibir { min-height: 46px; }
    .salir { background: none; border: 0; color: #c9d1d6; font: 500 .95rem var(--fuente); cursor: pointer; padding: 10px 4px; }
    .salir:hover { color: #fff; }
    .admin-movil { display: none; color: #c9d1d6; text-decoration: none; font-weight: 500; padding: 10px 4px; }

    @media (max-width: 640px) {
      .interior { gap: 10px; flex-wrap: wrap; }
      .nav { display: none; }
      .marca { margin-right: auto; }
      .recibir { order: 3; width: 100%; }
      .admin-movil { display: inline; }
    }
  `,
})
export class Marco {
  protected auth = inject(AuthService);
}

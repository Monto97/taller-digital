import { Component, inject } from '@angular/core';
import { InstalarApp } from '../core/instalar';

/** Aviso abajo de la pantalla para instalar Taller Digital como app en el celular. */
@Component({
  selector: 'app-aviso-instalar',
  template: `
    @if (app.mostrarAviso()) {
      <aside class="aviso-instalar" aria-label="Instalar la app">
        <img src="icono-192.png" alt="" width="44" height="44" class="icono" />
        <div class="texto">
          <strong>Tené Taller Digital como app</strong>
          @if (app.puedeInstalar()) {
            <span>Queda el ícono en tu celular y se abre a pantalla completa.</span>
          } @else {
            <span>Tocá <b>Compartir</b> <span class="compartir" aria-hidden="true">⬆︎</span> abajo y elegí <b>Agregar a inicio</b>.</span>
          }
        </div>
        <div class="acciones">
          @if (app.puedeInstalar()) {
            <button type="button" class="btn btn-primario" (click)="app.instalar()">Instalar</button>
          }
          <button type="button" class="cerrar" (click)="app.cerrar()" aria-label="Cerrar aviso">✕</button>
        </div>
      </aside>
    }
  `,
  styles: `
    .aviso-instalar {
      position: fixed; z-index: 50; left: 12px; right: 12px;
      bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      max-width: 520px; margin: 0 auto;
      display: flex; align-items: center; gap: 12px;
      padding: 12px 12px 12px 14px; border-radius: 12px;
      background: var(--grafito); color: #fff; box-shadow: 0 8px 24px rgb(0 0 0 / .25);
    }
    .icono { border-radius: 10px; flex: none; }
    .texto { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; font-size: .92rem; color: #c9d1d6; }
    .texto strong { color: #fff; font-size: 1rem; }
    .texto b { color: #fff; }
    .compartir { display: inline-block; padding: 0 4px; border: 1px solid #c9d1d6; border-radius: 4px; font-size: .8rem; }
    .acciones { display: flex; align-items: center; gap: 4px; flex: none; }
    .acciones .btn { min-height: 44px; padding: 0 16px; }
    .cerrar {
      width: 40px; height: 40px; border: 0; background: none; color: #c9d1d6;
      font-size: 1.1rem; cursor: pointer; border-radius: 6px;
    }
    .cerrar:hover { color: #fff; }
  `,
})
export class AvisoInstalar {
  protected app = inject(InstalarApp);
}

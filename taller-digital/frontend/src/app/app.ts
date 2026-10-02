import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { InstalacionService } from './core/instalacion';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  // Se crea al arrancar para no perderse el aviso de "se puede instalar" del navegador.
  private instalacion = inject(InstalacionService);
}

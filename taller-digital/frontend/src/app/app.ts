import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AvisoInstalar } from './layout/aviso-instalar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, AvisoInstalar],
  template: `
    <router-outlet />
    <!-- El link de seguimiento lo abre el cliente del taller: a él no le ofrecemos instalar nada. -->
    @if (!esSeguimiento()) {
      <app-aviso-instalar />
    }
  `,
})
export class App {
  private router = inject(Router);

  protected esSeguimiento = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.startsWith('/o/')),
    ),
    { initialValue: true },
  );
}

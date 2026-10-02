import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { Sesion } from './modelos';

const CLAVE = 'taller-digital.sesion';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);

  private sesion = signal<Sesion | null>(leerSesionGuardada());

  readonly usuario = computed(() => this.sesion()?.usuario ?? null);
  readonly taller = computed(() => this.sesion()?.taller ?? null);
  readonly logueado = computed(() => this.sesion() !== null);
  readonly token = computed(() => this.sesion()?.token ?? null);

  async login(email: string, password: string) {
    const sesion = await this.api.login(email, password);
    localStorage.setItem(CLAVE, JSON.stringify(sesion));
    this.sesion.set(sesion);
  }

  salir() {
    localStorage.removeItem(CLAVE);
    this.sesion.set(null);
    this.router.navigate(['/ingresar']);
  }
}

function leerSesionGuardada(): Sesion | null {
  try {
    const guardada = localStorage.getItem(CLAVE);
    return guardada ? (JSON.parse(guardada) as Sesion) : null;
  } catch {
    return null;
  }
}

/** Agrega el token a cada request y, si la API responde 401, cierra la sesión. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const conToken = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(conToken).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && token) auth.salir();
      return throwError(() => err);
    }),
  );
};

/** Protege las pantallas internas: sin sesión, manda a ingresar. */
export const requiereSesion: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.logueado() ? true : inject(Router).createUrlTree(['/ingresar']);
};

/** Si ya tiene sesión, no tiene sentido mostrarle el login. */
export const soloSinSesion: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.logueado() ? inject(Router).createUrlTree(['/']) : true;
};

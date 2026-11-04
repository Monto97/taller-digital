import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ApiService, DatosRegistro } from './api.service';
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
  readonly esAdmin = computed(() => this.sesion()?.usuario.admin === true);
  readonly token = computed(() => this.sesion()?.token ?? null);

  async login(email: string, password: string) {
    this.guardar(await this.api.login(email, password));
  }

  async registro(datos: DatosRegistro) {
    this.guardar(await this.api.registro(datos));
  }

  /** Después de editar el taller en Ajustes: refleja el nombre nuevo en la barra sin volver a ingresar. */
  actualizarTaller(taller: Sesion['taller']) {
    const actual = this.sesion();
    if (!actual || (actual.taller.nombre === taller.nombre && actual.taller.slug === taller.slug)) return;
    this.guardar({ ...actual, taller: { id: taller.id, nombre: taller.nombre, slug: taller.slug } });
  }

  private guardar(sesion: Sesion) {
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

/** El panel de admin es solo para los emails de ADMIN_EMAILS. La API igual lo vuelve a chequear. */
export const soloAdmin: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.esAdmin() ? true : inject(Router).createUrlTree(['/']);
};

/** Si ya tiene sesión, no tiene sentido mostrarle el login. */
export const soloSinSesion: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.logueado() ? inject(Router).createUrlTree(['/']) : true;
};

import { Routes } from '@angular/router';
import { requiereSesion, soloSinSesion } from './core/auth';
import { Marco } from './layout/marco';

export const routes: Routes = [
  {
    path: 'ingresar',
    canActivate: [soloSinSesion],
    title: 'Ingresar · Taller Digital',
    loadComponent: () => import('./pages/login/ingresar').then((m) => m.Ingresar),
  },
  {
    path: 'registro',
    canActivate: [soloSinSesion],
    title: 'Creá tu taller · Taller Digital',
    loadComponent: () => import('./pages/registro/registro').then((m) => m.Registro),
  },
  {
    // Link que recibe el cliente por WhatsApp: público, sin login ni menú.
    path: 'o/:token',
    title: 'Seguimiento de tu vehículo',
    loadComponent: () => import('./pages/seguimiento/seguimiento').then((m) => m.Seguimiento),
  },
  {
    path: '',
    component: Marco,
    canActivate: [requiereSesion],
    children: [
      {
        path: '',
        title: 'Tablero · Taller Digital',
        loadComponent: () => import('./pages/tablero/tablero').then((m) => m.Tablero),
      },
      {
        path: 'recibir',
        title: 'Recibir vehículo · Taller Digital',
        loadComponent: () => import('./pages/recibir/recibir').then((m) => m.Recibir),
      },
      {
        path: 'ordenes/:id',
        title: 'Orden · Taller Digital',
        loadComponent: () => import('./pages/orden/orden').then((m) => m.OrdenPagina),
      },
      {
        path: 'vehiculos/:id',
        title: 'Vehículo · Taller Digital',
        loadComponent: () => import('./pages/vehiculo/vehiculo').then((m) => m.VehiculoPagina),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

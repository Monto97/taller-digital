import { Routes } from '@angular/router';
import { requiereSesion, soloAdmin, soloSinSesion } from './core/auth';
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
        path: 'admin',
        canActivate: [soloAdmin],
        title: 'Admin · Taller Digital',
        loadComponent: () => import('./pages/admin/admin').then((m) => m.Admin),
      },
      {
        path: 'vehiculos/:id',
        title: 'Vehículo · Taller Digital',
        loadComponent: () => import('./pages/vehiculo/vehiculo').then((m) => m.VehiculoPagina),
      },
      {
        path: 'numeros',
        title: 'Números · Taller Digital',
        loadComponent: () => import('./pages/numeros/numeros').then((m) => m.NumerosPagina),
      },
      {
        path: 'historial',
        title: 'Historial · Taller Digital',
        loadComponent: () => import('./pages/historial/historial').then((m) => m.HistorialPagina),
      },
      {
        path: 'ajustes',
        title: 'Ajustes · Taller Digital',
        loadComponent: () => import('./pages/ajustes/ajustes').then((m) => m.AjustesPagina),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

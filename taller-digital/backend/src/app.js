const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const { pool } = require('./db/pool');
const { noEncontrado, manejadorErrores } = require('./middlewares/errores');
const { requireAuth, requireAdmin } = require('./middlewares/auth');
const authRoutes = require('./modules/auth/auth.routes');
const clientesRoutes = require('./modules/clientes/clientes.routes');
const vehiculosRoutes = require('./modules/vehiculos/vehiculos.routes');
const { ordenesRouter, tableroRouter } = require('./modules/ordenes/ordenes.routes');
const publicoRoutes = require('./modules/publico/publico.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const numerosRoutes = require('./modules/numeros/numeros.routes');
const mpRoutes = require('./modules/mercadopago/mp.routes');

const app = express();

app.set('trust proxy', 1); // detrás de un proxy (Railway, Nginx) para que el rate limit vea la IP real
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      // Angular agrega estilos inline; los links a WhatsApp se abren como navegación normal.
      'style-src': ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '100kb' }));
if (env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/salud', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ estado: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/clientes', requireAuth, clientesRoutes);
app.use('/api/vehiculos', requireAuth, vehiculosRoutes);
app.use('/api/ordenes', requireAuth, ordenesRouter);
app.use('/api/tablero', requireAuth, tableroRouter);
app.use('/api/numeros', requireAuth, numerosRoutes);
// Mercado Pago: /api/mp/url, /estado, /conexion requieren login (lo pide cada ruta).
// /api/mp/oauth/callback es público porque lo llama MP tras autorizar.
app.use('/api/mp', mpRoutes.autenticadas);
app.use('/api/mp/oauth', mpRoutes.publico);
app.use('/api/publico', publicoRoutes);
app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);
app.use('/api', noEncontrado); // cualquier /api desconocida responde 404 en JSON

// En producción la misma app sirve el frontend de Angular.
if (env.FRONTEND_DIST && fs.existsSync(env.FRONTEND_DIST)) {
  const index = path.join(env.FRONTEND_DIST, 'index.html');
  app.use(express.static(env.FRONTEND_DIST, {
    index: false,
    maxAge: '7d',
    // El service worker y el manifiesto se revisan en cada visita para tomar los cambios.
    setHeaders: (res, ruta) => {
      if (/(sw\.js|manifest\.webmanifest)$/.test(ruta)) res.set('Cache-Control', 'no-cache');
    },
  }));
  // Las rutas de Angular (/ordenes/5, /o/abc...) devuelven index.html, sin cache para tomar cada deploy.
  app.get('/{*ruta}', (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(index));
}

app.use(noEncontrado);
app.use(manejadorErrores);

module.exports = app;

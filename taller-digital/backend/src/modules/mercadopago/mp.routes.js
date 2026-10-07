const { Router } = require('express');
const env = require('../../config/env');
const { requireAuth } = require('../../middlewares/auth');
const service = require('./mp.service');

/**
 * Rutas de Mercado Pago. Dos grupos:
 *   - Autenticadas: /url, /estado, /conexion (operan sobre el taller del token).
 *   - Pública: /oauth/callback (lo llama MP tras autorizar; se identifica el taller por el `state` firmado).
 * Se montan por separado en app.js para que el callback NO exija Authorization.
 */

const autenticadas = Router();

autenticadas.get('/url', requireAuth, async (req, res) => {
  res.json(await service.urlAutorizacion(req.auth));
});

autenticadas.get('/estado', requireAuth, async (req, res) => {
  res.json(await service.estado(req.auth.tallerId));
});

autenticadas.delete('/conexion', requireAuth, async (req, res) => {
  res.json(await service.desconectar(req.auth.tallerId));
});

// --- Público: lo llama Mercado Pago, no el front ---
const publico = Router();

publico.get('/callback', async (req, res) => {
  const resultado = await service.procesarCallback(req.query);
  // Volvemos al front con un resultado legible. El front muestra el aviso según ?conectado=.
  const base = env.PUBLIC_APP_URL.replace(/\/$/, '');
  const url = resultado.ok
    ? `${base}/ajustes?conectado=ok`
    : `${base}/ajustes?conectado=error&motivo=${encodeURIComponent(resultado.motivo || 'desconocido')}`;
  res.redirect(302, url);
});

module.exports = { autenticadas, publico };

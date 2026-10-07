const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const { z } = require('zod');
const env = require('../../config/env');
const validate = require('../../middlewares/validate');
const { textoOpcional } = require('../../utils/esquemas');
const { slugify } = require('../../utils/formato');
const service = require('./publico.service');
const pagosMp = require('../mercadopago/pagos.service');
const webhookMp = require('../mercadopago/webhook.service');

// Sin login: el cliente entra con el token del link de WhatsApp.
const router = Router();

// Frena a quien quiera probar tokens por fuerza bruta.
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (_req, res) => res.status(429).json({
    error: { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Demasiados intentos. Probá de nuevo en un minuto.' },
  }),
}));

const paramsToken = z.object({
  token: z.string().regex(/^[0-9a-f]{32}$/, 'Link inválido.'),
});
const rechazo = z.object({ motivo: textoOpcional(500) });
const tipoPdf = z.object({ tipo: z.enum(['presupuesto', 'comprobante']).optional() });

router.get('/ordenes/:token', validate({ params: paramsToken }), async (req, res) => {
  res.json(await service.obtener(req.datos.params.token));
});

router.post('/ordenes/:token/aprobar', validate({ params: paramsToken }), async (req, res) => {
  res.json(await service.aprobar(req.datos.params.token));
});

router.post('/ordenes/:token/rechazar', validate({ params: paramsToken, body: rechazo }), async (req, res) => {
  res.json(await service.rechazar(req.datos.params.token, req.datos.body));
});

// Webhook de Mercado Pago. Siempre responde 200 (así MP no reintenta eternamente)
// salvo que la firma sea inválida con secret configurado (401, invita a MP a reintentar).
// La verificación "de verdad" es consultar la orden a MP con el access_token del taller;
// el header x-signature es un extra para cortar al toque los disparos falsos.
router.post('/mp/webhook', async (req, res) => {
  try {
    const resultado = await webhookMp.procesar({
      body: req.body,
      query: req.query,
      signatureHeader: req.get('x-signature'),
      requestId: req.get('x-request-id'),
    });
    if (resultado.firmaInvalida) {
      return res.status(401).json({ ok: false, motivo: 'firma_invalida' });
    }
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.log('[mp-webhook]', resultado);
    }
    return res.status(200).json({ ok: true, resultado: resultado.resultado });
  } catch (err) {
    // Nunca devolver 5xx al webhook: MP reintenta y satura. Logueamos y seguimos.
    // eslint-disable-next-line no-console
    console.error('[mp-webhook] error inesperado:', err);
    return res.status(200).json({ ok: false, motivo: 'error_interno' });
  }
});

// Iniciar pago online: lo abre el cliente desde el link público o desde el WhatsApp.
// GET para que funcione desde un <a>. Nunca devuelve JSON: siempre redirige, al
// checkout de MP o a /o/:token con un ?pago=... para que la UI muestre el aviso.
router.get('/mp/iniciar-pago/:token', validate({ params: paramsToken }), async (req, res) => {
  const { token } = req.datos.params;
  const base = env.PUBLIC_APP_URL.replace(/\/$/, '');
  try {
    const { checkout_url } = await pagosMp.iniciarPago(token);
    return res.redirect(302, checkout_url);
  } catch (err) {
    const codigo = err?.codigo || 'error';
    // Códigos conocidos: ORDEN_CANCELADA, YA_PAGADA, MP_NO_CONECTADO, NO_ENCONTRADO. Resto → "error".
    const motivos = {
      YA_PAGADA: 'ya_pagada',
      MP_NO_CONECTADO: 'no_disponible',
      ORDEN_CANCELADA: 'cancelada',
      NO_ENCONTRADO: 'no_encontrado',
    };
    const motivo = motivos[codigo] || 'error';
    return res.redirect(302, `${base}/o/${token}?pago=${motivo}`);
  }
});

// Comprobante en PDF por token (lo que el cliente abre desde WhatsApp).
router.get('/ordenes/:token/pdf', validate({ params: paramsToken, query: tipoPdf }), async (req, res) => {
  const { buffer, numero, tipo, patente } = await service.pdfPorToken(
    req.datos.params.token,
    req.datos.query.tipo,
  );
  const nombre = `${tipo}-${numero}-${slugify(patente)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
  res.send(buffer);
});

module.exports = router;

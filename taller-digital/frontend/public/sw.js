/*
 * Service worker mínimo: existe para que Chrome en Android ofrezca "Instalar app".
 * No guarda nada en caché (cada deploy se ve al instante). Solo atiende las
 * navegaciones para mostrar un aviso claro cuando el celular no tiene conexión.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const SIN_CONEXION = `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sin conexión · Taller Digital</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 20px; box-sizing: border-box;
         background: #1e262d; color: #fff; font: 16px system-ui, sans-serif; text-align: center; }
  button { margin-top: 16px; min-height: 52px; padding: 0 24px; border: 0; border-radius: 8px;
           background: #f0b429; color: #1e262d; font: 700 1rem system-ui, sans-serif; }
</style></head>
<body><div>
  <h1>Sin conexión</h1>
  <p>Revisá el wifi o los datos del celular y probá de nuevo.</p>
  <button onclick="location.reload()">Reintentar</button>
</div></body></html>`;

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(SIN_CONEXION, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    ),
  );
});

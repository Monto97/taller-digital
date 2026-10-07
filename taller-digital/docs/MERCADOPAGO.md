# Mercado Pago — crear el app y conectar un taller

Esta nota es solo para la primera configuración (lo hacés una vez por entorno).
Después, cada taller conecta su propia cuenta desde el botón "Conectar Mercado
Pago" en la pantalla **Ajustes del taller**.

## 1. Crear la aplicación en MP developers

1. Entrar a <https://www.mercadopago.com.ar/developers/panel/app>.
2. "Crear aplicación".
   - **Nombre**: `Taller Digital` (o lo que prefieras).
   - **¿Qué producto estás integrando?**: Checkout Pro.
   - **¿La aplicación es para tu negocio o para tus clientes?**: _Para mis clientes_.
     Esto habilita OAuth / Marketplace (cada taller conecta su propia cuenta).
3. En "Datos de la aplicación":
   - **Redirect URIs**: agregá una para cada entorno. Como mínimo:
     - Dev: `http://localhost:3000/api/mp/oauth/callback`
     - Prod: `https://TU-DOMINIO/api/mp/oauth/callback`
4. En "Credenciales de producción" (y "Credenciales de prueba" si querés testear
   sin plata real) vas a tener `Client ID` y `Client Secret`.

## 2. Variables de entorno

Backend `.env`:

```
MP_CLIENT_ID=xxxxxxxxxxxxxxxx
MP_CLIENT_SECRET=xxxxxxxxxxxxxxxx
# Opcional. Si no se define, se arma como ${PUBLIC_APP_URL}/api/mp/oauth/callback.
# MP_REDIRECT_URI=http://localhost:3000/api/mp/oauth/callback
```

Reiniciar el backend. Hasta que estén cargadas, `GET /api/mp/estado` responde
`{ configurado: false }` y la pantalla de ajustes muestra el aviso.

## 3. Migrar la base

```
node scripts/migrar-mercadopago.js
```

(idempotente: crea la tabla `taller_mercadopago` si no existe)

## 4. Conectar la cuenta del taller

1. Loguearse en la app como dueño del taller.
2. Ir a **Ajustes del taller** → sección Mercado Pago → **Conectar Mercado Pago**.
3. El browser redirige a MP. Loguearse con la cuenta del taller y autorizar.
4. MP vuelve a `/ajustes?conectado=ok`.

A partir de ahí, el back tiene el `access_token` del taller y puede crear
preferencias de pago usándolo (próxima iteración).

## 5. Desarrollo local y webhook (próxima iteración)

Mercado Pago necesita una URL **pública** para avisar los pagos. En dev se
levanta un túnel (ej.: `ngrok http 3000`) y se agrega la URL del túnel como
Redirect URI (y, cuando esté, como Webhook URL).

Para el OAuth del callback (lo que ya está hecho), el redirect sí puede ser
`localhost` si el taller está en la misma máquina que corre el browser.

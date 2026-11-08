# Publicar Taller Digital

Guía para subir el sistema a internet y que el taller lo use desde cualquier lado. Usa [Railway](https://railway.com) porque corre la app y la base MySQL en el mismo proyecto, se conecta a GitHub y publica solo cada vez que subís cambios.

Cómo queda armado:

```
Internet ──► Servicio "taller-digital" (Dockerfile)
              ├── API de Express en /api
              └── Frontend de Angular en todo lo demás
                    │
                    ▼ red privada
              Servicio "MySQL" (lo crea Railway)
```

Todo sale de un solo `Dockerfile` en la raíz del repo. Al arrancar, el contenedor crea las tablas si es la primera vez (`scripts/init-db.js`) y levanta la API.

---

## 1. Subir el código a GitHub

En la raíz del proyecto (donde están `backend`, `frontend` y el `Dockerfile`):

```powershell
git init
git add .
git commit -m "MVP Taller Digital"
```

Creá un repositorio **privado** en GitHub y seguí las instrucciones que te da para subirlo (`git remote add origin ...` y `git push`).

El `.gitignore` ya deja afuera `node_modules` y los `.env`, así que no se suben contraseñas.

## 2. Crear el proyecto en Railway

1. Entrá a Railway con tu cuenta de GitHub.
2. **New Project → Deploy from GitHub repo** y elegí el repositorio. Railway detecta el `Dockerfile` y empieza a construir. El primer intento va a fallar porque todavía no tiene base de datos ni variables: es normal.
3. En el mismo proyecto: **+ New → Database → MySQL**.

## 3. Configurar las variables

Entrá al servicio de la app (no al de MySQL) → pestaña **Variables** y cargá estas:

| Variable | Valor |
|---|---|
| `DB_HOST` | `${{MySQL.MYSQLHOST}}` |
| `DB_PORT` | `${{MySQL.MYSQLPORT}}` |
| `DB_USER` | `${{MySQL.MYSQLUSER}}` |
| `DB_PASSWORD` | `${{MySQL.MYSQLPASSWORD}}` |
| `DB_NAME` | `${{MySQL.MYSQLDATABASE}}` |
| `JWT_SECRET` | Uno nuevo y largo (ver abajo). No uses el de tu PC. |
| `PUBLIC_APP_URL` | La URL pública de la app (paso 4). |
| `CORS_ORIGIN` | La misma URL pública. |
| `ADMIN_EMAILS` | Tu email (el del usuario con el que vas a entrar). Te da acceso al panel de admin. |
| `AVISO_REGISTRO_URL` | Opcional. `https://ntfy.sh/` + un tema que solo vos conozcas (ej. `https://ntfy.sh/taller-digital-registros-x7k2`). Te llega una notificación al celular por cada taller que se registra. |

Los valores con `${{MySQL...}}` son referencias: Railway completa solo los datos de la base. Si tu servicio de base no se llama `MySQL`, cambiá esa parte por su nombre.

Para generar el `JWT_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`NODE_ENV=production` ya viene en el Dockerfile, y `PORT` lo pone Railway: no hace falta cargarlas.

## 4. Generar la URL pública

En el servicio de la app → **Settings → Networking → Generate Domain**. Te da algo como `https://taller-digital-production.up.railway.app`.

Volvé a **Variables** y poné esa URL (sin `/` al final) en `PUBLIC_APP_URL` y `CORS_ORIGIN`. Es la que va en los links de WhatsApp que recibe el cliente.

Cada cambio de variables vuelve a desplegar la app. Cuando termine, entrá a `https://TU-URL/api/salud`: tiene que decir `{"estado":"ok"}`. En los logs del deploy vas a ver `Tablas creadas en "railway"`.

## 5. Crear tu usuario y el taller de tu cliente

El registro es abierto: entrá a `https://TU-URL/registro` y creá **tu propio taller** (por ejemplo, "Taller de Prueba") con el email que pusiste en `ADMIN_EMAILS`. Ese usuario ve el **panel de admin** (ver más abajo).

A tus clientes les pasás el mismo link `https://TU-URL/registro` y crean su taller solos (también se llega desde "Creá tu taller" en la pantalla de ingreso). Si preferís, también los podés dar de alta vos desde el panel de admin.

El teléfono del taller importa: es el que usa el botón "Tengo una consulta" del link que recibe el cliente.

## Panel de admin

Entrá con tu usuario (el de `ADMIN_EMAILS`): en el menú aparece **Admin**. Ahí tenés:

- **Métricas generales:** cuántos talleres arrancaron y cuántos lo usan esta semana, órdenes por día, porcentaje de presupuestos aprobados (y cuántos desde el link del cliente), avisos por WhatsApp y monto de trabajos entregados.
- **Lista de talleres** con su nivel de uso (usándolo, poco uso, dejó de usarlo, sin arrancar), último ingreso y actividad.
- **Nuevo taller:** lo creás con una contraseña generada y le mandás los datos de ingreso por WhatsApp con un toque.
- **Deshabilitar** un taller (por ejemplo, si deja de pagar): no puede entrar y se le cierran las sesiones abiertas. Se vuelve a habilitar con un clic, sin perder datos.

Para dar acceso de admin a otra persona, sumá su email a `ADMIN_EMAILS` separado por coma. Para quitárselo, sacalo de la lista: el acceso se corta al instante.

Los talleres que se registraron en los últimos 3 días aparecen con la marca **Nuevo**. Los autos de ejemplo que trae cada registro no cuentan en ninguna métrica: un taller figura como "arrancó" recién cuando carga su primera orden real.

### Aviso al celular cuando se registra un taller

1. Instalá la app **ntfy** (Android o iPhone, es gratis).
2. Inventá un tema difícil de adivinar, por ejemplo `taller-digital-registros-x7k2`, y suscribite a ese tema en la app.
3. En Railway cargá `AVISO_REGISTRO_URL=https://ntfy.sh/taller-digital-registros-x7k2`.

Cada vez que alguien se registre desde `/registro` te llega una notificación con el nombre del taller, el dueño y su WhatsApp. Al tocarla se abre el chat con él. Si ntfy no responde, el registro igual se completa.

## 6. Dejarlo en el celular del taller

Abrí la URL en el celular del dueño e ingresá con su usuario. Arriba del tablero aparece un aviso para tenerlo como app:

- **Android (Chrome):** el aviso tiene un botón **Instalar**. Un toque y queda el ícono.
- **iPhone (Safari):** Apple no deja poner ese botón, así que el aviso explica el camino: botón compartir → **Agregar a inicio**.

Si tocan "Ahora no", el aviso vuelve a aparecer a la semana. También se puede instalar en cualquier momento desde el menú del navegador.

Queda un ícono como el de cualquier app y se abre a pantalla completa.

---

## Actualizar la app

Cada `git push` a la rama principal vuelve a construir y publicar solo. Los datos de la base no se tocan.

Si cambiás `database/schema.sql`, el script de inicio **no** modifica tablas que ya existen: hay que aplicar el cambio a mano (por ejemplo, un `ALTER TABLE` desde la consola de MySQL de Railway). Cuando empiecen a ser frecuentes, conviene sumar migraciones.

## Backups

Antes de que el taller cargue datos reales, revisá en el servicio de MySQL la parte de backups de Railway. Mientras tanto, podés bajar una copia cuando quieras con `mysqldump` usando la `MYSQL_PUBLIC_URL` que aparece en las variables del servicio de MySQL.

## Si algo no anda

| Síntoma | Qué revisar |
|---|---|
| El deploy falla con `Variables de entorno inválidas` | Falta alguna variable o `JWT_SECRET` tiene menos de 32 caracteres. Los logs dicen cuál. |
| `No se pudo inicializar la base` | Las variables `DB_*` no apuntan al MySQL. Revisá que el nombre del servicio en `${{MySQL...}}` coincida. |
| Los links de WhatsApp llevan a `localhost` | `PUBLIC_APP_URL` sigue con el valor de desarrollo. |

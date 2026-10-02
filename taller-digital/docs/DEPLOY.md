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
| `REGISTRO_CLAVE` | Una clave tuya de 12 caracteres o más, para crear talleres (paso 5). |

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

## 5. Crear el taller de tu cliente

En producción el registro está cerrado. Solo se abre si mandás la `REGISTRO_CLAVE` en un header. Desde PowerShell en tu PC:

```powershell
$body = @{
  taller  = @{ nombre = "Taller Nombre Real"; telefono = "2241 15 00-0000"; direccion = "Calle 123, Chascomús" }
  usuario = @{ nombre = "Nombre del dueño"; email = "dueno@mail.com"; password = "una-clave-para-el" }
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri https://TU-URL/api/auth/registro `
  -Headers @{ "X-Clave-Registro" = "TU-REGISTRO_CLAVE" } `
  -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

El teléfono del taller importa: es el que usa el botón "Tengo una consulta" del link que recibe el cliente.

Si no vas a crear más talleres por un tiempo, podés borrar `REGISTRO_CLAVE` de las variables y el registro queda cerrado del todo.

## 6. Dejarlo en el celular del taller

Abrí la URL en el celular del dueño, ingresá con su usuario y:

- **Android (Chrome):** menú ⋮ → **Agregar a pantalla de inicio**.
- **iPhone (Safari):** botón compartir → **Agregar a inicio**.

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
| `REGISTRO_CERRADO` al crear el taller | Falta el header o la clave no coincide con `REGISTRO_CLAVE`. |

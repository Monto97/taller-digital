# Taller Digital

Sistema de gestión para talleres de autos y motos. Ordena el trabajo diario del taller (órdenes de trabajo, presupuestos e historial por patente) y mantiene informado al cliente por WhatsApp, sin que tenga que descargar ninguna app.

Este repositorio contiene el **MVP**: lo mínimo para que un taller real deje el cuaderno y trabaje con el sistema todos los días.

## Alcance del MVP

**Incluye**
- Talleres y usuarios (dueño y mecánicos), multi-tenant.
- Clientes y vehículos (autos y motos), con búsqueda por patente.
- Órdenes de trabajo con estados: recibido, diagnóstico, esperando aprobación, en reparación, listo, entregado.
- Presupuesto dentro de la orden, con ítems de repuestos y mano de obra.
- Link público para el cliente: ve el estado de su vehículo y aprueba o rechaza el presupuesto.
- Avisos por WhatsApp mediante links `wa.me` con el mensaje ya armado (sin API paga).
- Tablero del día e historial por vehículo.
- Lista de próximos services para recordar a los clientes.

**Queda para después:** stock de repuestos, cobros con Mercado Pago, facturación electrónica ARCA, reportes, turnos, fotos y envío automático de WhatsApp por API.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Angular 21 (standalone, signals) |
| Backend | Node.js + Express |
| Base de datos | MySQL 8 |
| Autenticación | JWT |

## Estructura

```
taller-digital/
├── README.md
├── docker-compose.yml          # MySQL 8 para desarrollo
├── Dockerfile                  # Imagen de producción: API + frontend en un solo servicio
├── database/
│   └── schema.sql              # Schema completo de MySQL
├── docs/
│   ├── API.md                  # Endpoints, requests y responses
│   ├── DATABASE.md             # Modelo de datos, estados y decisiones
│   ├── DEPLOY.md               # Cómo publicarlo en Railway
│   └── diagrama-bd.drawio      # Diagrama entidad-relación editable
└── backend/
    ├── .env.example
    ├── src/
    │   ├── server.js           # Arranque y apagado prolijo
    │   ├── app.js              # Express: middlewares y rutas
    │   ├── config/env.js       # Variables de entorno validadas con zod
    │   ├── db/pool.js          # Pool de MySQL y withTransaction()
    │   ├── middlewares/        # auth (JWT + roles), validate (zod), errores
    │   ├── utils/              # AppError, formatos, esquemas comunes, mensajes de WhatsApp
    │   └── modules/
    │       ├── auth/           # registro, login, /me
    │       ├── clientes/       # alta, búsqueda, edición
    │       ├── vehiculos/      # alta, búsqueda por patente, historial
    │       ├── ordenes/        # órdenes, estados, ítems, presupuesto, WhatsApp, tablero
    │       └── publico/        # link del cliente: ver estado y aprobar o rechazar
    ├── scripts/                # init-db (crea tablas) y crear-taller (alta de talleres)
    └── tests/                  # Tests de integración contra una base _test
└── frontend/
    ├── proxy.conf.json         # En desarrollo, /api va al backend (sin CORS)
    └── src/
        ├── styles.css          # Colores, tipografía, botones y formularios
        └── app/
            ├── core/           # API, sesión (login, token, guard) y tipos
            ├── shared/         # Componente de patente y formatos (pesos, km, fechas)
            ├── layout/         # Barra superior
            └── pages/          # ingresar, tablero, recibir, orden, vehiculo, seguimiento (cliente)
```

Cada módulo de negocio sigue el mismo patrón: `*.routes.js` (HTTP), `*.schemas.js` (validación) y `*.service.js` (lógica y SQL).

## Puesta en marcha

### Requisitos
- Node.js 22 (o 20.19+)
- Docker Desktop

### 1. Base de datos

MySQL corre en Docker. Desde la raíz del proyecto:

```bash
docker compose up -d
```

La primera vez descarga la imagen de MySQL 8 y crea la base `taller_digital` con todas las tablas a partir de `database/schema.sql`. Queda escuchando en `localhost:3306` con usuario `root` y contraseña `taller123` (solo para desarrollo).

| Acción | Comando |
|---|---|
| Ver si está listo | `docker compose ps` (tiene que decir `healthy`) |
| Apagar | `docker compose down` |
| Volver a un schema limpio | `docker compose down -v` y después `docker compose up -d` |
| Entrar a la consola de MySQL | `docker exec -it taller-digital-mysql mysql -uroot -ptaller123 taller_digital` |

El schema solo se carga cuando el volumen está vacío: si cambiás `schema.sql`, hay que recrear la base con `down -v`.

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env    # completar JWT_SECRET
npm run dev             # http://localhost:3000/api
```

Para generar un `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Probá que responde con `curl http://localhost:3000/api/salud` y creá el primer taller:

```bash
curl -X POST http://localhost:3000/api/auth/registro \
  -H "Content-Type: application/json" \
  -d '{"taller":{"nombre":"Taller Rodríguez"},"usuario":{"nombre":"Diego","email":"diego@taller.com","password":"clave-segura-123"}}'
```

### 3. Frontend

Con el backend corriendo, en otra terminal:

```bash
cd frontend
npm install
npm start               # http://localhost:4200
```

Ingresá con el email y la contraseña del taller que creaste con `/auth/registro`. El proxy de `proxy.conf.json` manda todo lo que empieza con `/api` al backend en el puerto 3000.

Pantallas del MVP:

| Pantalla | Ruta | Para qué |
|---|---|---|
| Ingresar | `/ingresar` | Login con email y contraseña. |
| Tablero | `/` | Los vehículos del taller por estado y búsqueda por patente. |
| Recibir vehículo | `/recibir` | Patente primero; si es nuevo, sus datos y los del dueño. |
| Orden | `/ordenes/:id` | Estado, diagnóstico, presupuesto, avisos por WhatsApp y bitácora. |
| Vehículo | `/vehiculos/:id` | Ficha y todo lo que se le hizo. |
| Seguimiento | `/o/:token` | Lo que ve el cliente desde WhatsApp, sin login: estado y aprobación del presupuesto. |

### 4. Tests

Los tests corren contra una base aparte (`taller_digital_test`) en el mismo MySQL de Docker, que se borra y se recrea en cada corrida.

```bash
cp .env.test.example .env.test
npm test
```

## Documentación

- [Modelo de datos](docs/DATABASE.md): tablas, diagrama, estados de la orden y decisiones de diseño.
- [API](docs/API.md): todos los endpoints con ejemplos.
- [Publicar en internet](docs/DEPLOY.md): Railway, variables, alta del taller y app en el celular.
- [Diagrama editable](docs/diagrama-bd.drawio): abrilo en [app.diagrams.net](https://app.diagrams.net) o con la extensión Draw.io Integration de VS Code.

## Reglas clave del negocio

- Toda consulta filtra por `req.auth.tallerId`, que sale del JWT. Nunca se toma de la URL ni del body.
- Las patentes se normalizan: mayúsculas, sin espacios ni guiones.
- El número de orden es correlativo por taller.
- Modificar un presupuesto ya enviado lo vuelve a borrador y hay que reenviarlo.
- El cliente accede a su orden con un token aleatorio, nunca con el ID.

## Plan de desarrollo

1. ✅ **Base:** proyecto Express, conexión a MySQL, auth con JWT y middleware de tenant.
2. ✅ **Núcleo:** clientes, vehículos y órdenes con cambios de estado.
3. ✅ **Presupuesto y cliente:** ítems, envío, links de WhatsApp y página del cliente para seguir su vehículo y aprobar.
4. 🟡 **Pantallas:** ✅ ingresar, tablero, recibir vehículo, orden y ficha del vehículo · ⏳ services a recordar.
5. ✅ **Salida a producción:** Dockerfile, registro cerrado, scripts de base y de alta de talleres, ícono para el celular y [guía de publicación](docs/DEPLOY.md).

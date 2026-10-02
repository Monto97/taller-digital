# API

API REST en JSON. Base URL en desarrollo: `http://localhost:3000/api`.

**Estado de implementación:** ✅ Salud, Auth, Clientes, Vehículos, Órdenes, Tablero y Público. Pendiente: Taller y usuarios, y Servicios programados.

## Convenciones

**Autenticación.** Todos los endpoints salvo los de `/auth/login`, `/auth/registro` y `/publico` requieren el header `Authorization: Bearer <token>`. El token es un JWT que incluye `usuario_id`, `taller_id` y `rol`. El backend toma el `taller_id` siempre del token, nunca del body ni de la URL.

**Roles.** `dueno` puede todo. `mecanico` puede ver y operar órdenes, clientes y vehículos, pero no gestionar usuarios ni datos del taller. Los endpoints marcados con 🔒 son solo para `dueno`.

**Paginación.** Los listados aceptan `?pagina=1&por_pagina=20` (máximo 100) y responden:

```json
{ "datos": [ ... ], "pagina": 1, "por_pagina": 20, "total": 134 }
```

**Errores.** Siempre con el mismo formato:

```json
{ "error": { "codigo": "TRANSICION_INVALIDA", "mensaje": "No se puede pasar de 'recibido' a 'listo'." } }
```

| HTTP | Código | Cuándo |
|---|---|---|
| 400 | `VALIDACION` | Faltan campos o tienen formato inválido. Incluye `detalles` por campo. |
| 400 | `JSON_INVALIDO` | El body no es un JSON válido. |
| 401 | `NO_AUTENTICADO` | Falta el token o expiró. |
| 401 | `CREDENCIALES_INVALIDAS` | Email o contraseña incorrectos (no se distingue cuál, a propósito). |
| 403 | `CUENTA_INACTIVA` | El usuario o el taller están desactivados. |
| 403 | `SIN_PERMISO` | El rol no alcanza para esa acción. |
| 404 | `NO_ENCONTRADO` | No existe o pertenece a otro taller (no se distingue a propósito). |
| 409 | `EMAIL_EN_USO` | Ya existe una cuenta con ese email. |
| 409 | `PATENTE_DUPLICADA` | Ya hay un vehículo con esa patente en el taller. Incluye `detalles.vehiculo_id` para que el front ofrezca abrirlo. |
| 409 | `CLIENTE_CON_VEHICULOS` | Se intenta eliminar un cliente que todavía tiene vehículos a su nombre. |
| 409 | `TRANSICION_INVALIDA` | El cambio de estado no está permitido. |
| 409 | `PRESUPUESTO_BLOQUEADO` | Se intenta enviar o aprobar un presupuesto que ya fue aprobado o que no está en `enviado`. |
| 409 | `PRESUPUESTO_VACIO` | Se intenta enviar un presupuesto sin ítems. |
| 409 | `ORDEN_CERRADA` | Se intenta modificar una orden entregada o cancelada. |
| 409 | `CLIENTE_SIN_TELEFONO` | Se pide un link de WhatsApp y el cliente no tiene teléfono. |
| 429 | `DEMASIADOS_INTENTOS` | Se superó el límite de requests (login, registro y endpoints públicos). |
| 500 | `ERROR_INTERNO` | Error no previsto. En desarrollo incluye `debug` con el mensaje original. |

**Patentes.** Se normalizan al recibirlas: mayúsculas, sin espacios ni guiones. `ae-482 kt` se guarda y busca como `AE482KT`. Se valida que tengan formato argentino (`AB123CD`, `ABC123`, `A123BCD` o `123ABC`); para patentes extranjeras se manda `"formato_libre": true`.

**Teléfonos.** Se guardan listos para `wa.me`: `221 555-0143` y `0221 15 555-0143` quedan como `5492215550143`.

**Textos opcionales.** Mandar `""` en un campo opcional lo deja en `null`, así el front puede borrar un dato.

---

## Salud

### `GET /salud`
Chequea que la API y la base respondan: `{ "estado": "ok" }`. Sirve para el health check del hosting.

---

## Auth

### `POST /auth/registro`
Crea un taller y su usuario dueño. Es abierto: lo usa la pantalla `/registro` del front para que cada taller cree su cuenta. Tiene el mismo límite de intentos que el login.

También se puede crear un taller con `npm run crear-taller` desde `backend/`.

```json
// request
{ "taller": { "nombre": "Taller Rodríguez", "telefono": "5492215550000" },
  "usuario": { "nombre": "Diego Rodríguez", "email": "diego@taller.com", "password": "********" } }
// 201
{ "token": "eyJ...", "usuario": { "id": 1, "nombre": "Diego Rodríguez", "rol": "dueno" },
  "taller": { "id": 1, "nombre": "Taller Rodríguez", "slug": "taller-rodriguez" } }
```

### `POST /auth/login`
```json
// request
{ "email": "diego@taller.com", "password": "********" }
// 200
{ "token": "eyJ...", "usuario": { "id": 1, "nombre": "Diego Rodríguez", "rol": "dueno" },
  "taller": { "id": 1, "nombre": "Taller Rodríguez" } }
```

### `GET /auth/me`
Devuelve el usuario y el taller del token.

---

## Taller y usuarios

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/taller` | Datos del taller. |
| PATCH | `/taller` 🔒 | Actualiza nombre, teléfono, dirección o logo. |
| GET | `/usuarios` 🔒 | Lista usuarios del taller. |
| POST | `/usuarios` 🔒 | Crea un mecánico: `{ nombre, email, password, rol }`. |
| PATCH | `/usuarios/:id` 🔒 | Edita nombre, rol o `activo`. |

---

## Clientes

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/clientes?q=laura` | Busca por nombre o teléfono (paginado). Cada cliente trae `cantidad_vehiculos`. |
| POST | `/clientes` | Crea: `{ nombre, telefono?, email?, notas? }`. |
| GET | `/clientes/:id` | Detalle con sus vehículos. |
| PATCH | `/clientes/:id` | Edita. |
| DELETE | `/clientes/:id` 🔒 | Borrado lógico (204). Falla con `CLIENTE_CON_VEHICULOS` si todavía tiene vehículos. |

---

## Vehículos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/vehiculos?q=AE48&tipo=moto&cliente_id=3` | Busca por patente parcial, marca, modelo o nombre del dueño (paginado). |
| GET | `/vehiculos/patente/:patente` | Búsqueda exacta. 404 si no existe (el front ofrece crearlo). |
| POST | `/vehiculos` | Crea con un cliente existente (`cliente_id`) o uno nuevo (`cliente`), uno de los dos. |
| GET | `/vehiculos/:id` | Detalle con cliente actual, cantidad de visitas, orden en curso y próximo service. |
| PATCH | `/vehiculos/:id` | Edita, incluido cambio de dueño (`cliente_id`). |
| GET | `/vehiculos/:id/historial` | Órdenes entregadas y en curso, con ítems y totales, de la más reciente a la más vieja. |

### `POST /vehiculos`
Pensado para el mostrador: en una sola pantalla se carga el vehículo y, si hace falta, el dueño.

```json
// con un cliente nuevo
{ "patente": "ae-482 kt", "tipo": "auto", "marca": "Fiat", "modelo": "Cronos", "anio": 2019, "km_actual": 87450,
  "cliente": { "nombre": "Laura Giménez", "telefono": "221 555-0143" } }

// con un cliente existente
{ "patente": "A057JKR", "tipo": "moto", "marca": "Honda", "cliente_id": 7 }
```

Responde 201 con el mismo formato que `GET /vehiculos/:id`:

```json
{ "id": 12, "patente": "AE482KT", "tipo": "auto", "marca": "Fiat", "modelo": "Cronos", "anio": 2019, "km_actual": 87450,
  "cliente": { "id": 7, "nombre": "Laura Giménez", "telefono": "5492215550143" },
  "visitas": 0, "ultima_visita": null, "orden_activa": null, "proximo_servicio": null }
```

Ejemplo de `GET /vehiculos/12/historial`:

```json
{
  "vehiculo": { "id": 12, "patente": "AE482KT", "tipo": "auto", "marca": "Fiat", "modelo": "Cronos", "km_actual": 87450 },
  "ordenes": [
    { "id": 1284, "numero": 1284, "fecha_ingreso": "2026-10-13T11:52:00Z", "km_ingreso": 87450,
      "estado": "esperando_aprobacion", "motivo": "Ruido en la distribución", "total": "486000.00",
      "items": [ { "tipo": "repuesto", "descripcion": "Kit de distribución", "cantidad": "1.00", "precio_unitario": "214000.00" } ] }
  ]
}
```

---

## Órdenes

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/ordenes` | Filtros: `estado`, `mecanico_id`, `vehiculo_id`, `activas=true` (excluye entregadas y canceladas), `desde`, `hasta`. |
| POST | `/ordenes` | Crea la orden y su evento `creada`. |
| GET | `/ordenes/:id` | Detalle completo: vehículo, cliente, mecánico, ítems y eventos. |
| PATCH | `/ordenes/:id` | Edita `motivo`, `diagnostico`, `mecanico_id`, `km_ingreso`, `fecha_estimada_entrega`. |
| POST | `/ordenes/:id/estado` | Cambia el estado: `{ estado, detalle? }`. Valida la transición (ver tabla abajo). |
| POST | `/ordenes/:id/notas` | Agrega una nota interna a la bitácora: `{ detalle }`. |

### Transiciones de estado

| Desde | Puede pasar a |
|---|---|
| `recibido` | `diagnostico`, `en_reparacion`, `cancelada` |
| `diagnostico` | `en_reparacion`, `cancelada` (a `esperando_aprobacion` solo enviando el presupuesto) |
| `esperando_aprobacion` | `diagnostico`, `en_reparacion`, `cancelada` |
| `en_reparacion` | `listo`, `cancelada` |
| `listo` | `entregado`, `en_reparacion` |
| `entregado`, `cancelada` | (ninguno: la orden queda cerrada) |

Cada respuesta de una orden trae `estados_siguientes`, así el front muestra solo los botones válidos. Efectos automáticos:

- De `esperando_aprobacion` a `en_reparacion` registra la aprobación del presupuesto por parte del taller (el cliente aprobó por teléfono).
- Al pasar a `listo`, la respuesta incluye `whatsapp_url` con el aviso de "listo para retirar".
- Al pasar a `entregado`, se completa `fecha_entrega`.

### `POST /ordenes`
Si el vehículo no existe, se puede crear en el mismo request para agilizar el mostrador. La respuesta trae el detalle completo de la orden más `whatsapp_url` con el mensaje de "recibimos tu auto" (o `null` si el cliente no tiene teléfono).

```json
// request con vehículo existente
{ "vehiculo_id": 12, "motivo": "Ruido en la distribución", "km_ingreso": 87450, "mecanico_id": 3 }

// request creando cliente y vehículo al vuelo
{ "vehiculo": { "patente": "AE482KT", "tipo": "auto", "marca": "Fiat", "modelo": "Cronos" },
  "cliente": { "nombre": "Laura Giménez", "telefono": "5492215550143" },
  "motivo": "Ruido en la distribución", "km_ingreso": 87450 }

// 201 (resumido)
{ "id": 1284, "numero": 1284, "estado": "recibido", "estado_etiqueta": "Recibido",
  "estados_siguientes": ["diagnostico", "en_reparacion", "cancelada"],
  "link_publico": "https://app.tallerdigital.com.ar/o/3f9c...", "total": "0.00",
  "presupuesto": { "estado": "borrador", "enviado_at": null, "respondido_at": null },
  "vehiculo": { ... }, "cliente": { ... }, "mecanico": null, "items": [], "eventos": [ ... ],
  "whatsapp_url": "https://wa.me/5492215550143?text=..." }
```

### Ítems del presupuesto

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/ordenes/:id/items` | Agrega: `{ tipo, descripcion, cantidad, precio_unitario }`. |
| PATCH | `/ordenes/:id/items/:itemId` | Edita un ítem. |
| DELETE | `/ordenes/:id/items/:itemId` | Elimina un ítem. |

Los tres recalculan `total` y devuelven la orden actualizada. Cada ítem trae su `subtotal`. Si el presupuesto estaba `enviado` (esperando respuesta), vuelve a `borrador` y la orden a `diagnostico`, porque el cliente vería otro precio. Si ya estaba `aprobado`, no se invalida: lo que se agrega durante la reparación queda como parte del trabajo.

### `POST /ordenes/:id/presupuesto/enviar`
Marca el presupuesto como `enviado`, pasa la orden a `esperando_aprobacion` y devuelve la orden con `whatsapp_url` listo para abrir. Requiere al menos un ítem y que la orden no esté en reparación todavía.

```json
// 200 (resumido)
{ "estado": "esperando_aprobacion", "presupuesto": { "estado": "enviado", ... },
  "whatsapp_url": "https://wa.me/5492215550143?text=Hola%20Laura..." }
```

### `GET /ordenes/:id/whatsapp?plantilla=listo`
Arma el link `wa.me` con el mensaje y el link público según la plantilla: `recibido`, `presupuesto` o `listo`. Responde `{ whatsapp_url, mensaje }`.

### `POST /ordenes/:id/whatsapp/registrar`
`{ "plantilla": "listo" }`. El front lo llama cuando el usuario abre el link, para dejar el aviso en la bitácora. Responde 204.

---

## Tablero

### `GET /tablero`
Todo lo que necesita la pantalla principal en una sola llamada.

```json
{
  "resumen": { "en_taller": 11, "listos": 2, "presupuestos_sin_respuesta": 2, "entregados_hoy": 4 },
  "columnas": {
    "recibido": [ { "id": 1290, "numero": 1290, "patente": "AF219KD", "tipo": "auto", "vehiculo": "Toyota Etios", "cliente": "Juan Pérez", "motivo": "Ruido en tren delantero", "total": "0.00", "mecanico": null, "fecha_ingreso": "...", "fecha_estimada_entrega": null, "presupuesto_enviado_at": null } ],
    "diagnostico": [],
    "esperando_aprobacion": [],
    "en_reparacion": [],
    "listo": []
  }
}
```

---

## Servicios programados

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/servicios?vencen_hasta=2026-11-30&estado=pendiente` | Services a recordar. |
| POST | `/servicios` | Crea: `{ vehiculo_id, descripcion, fecha_estimada?, km_estimado?, orden_origen_id? }`. Requiere fecha o km. |
| PATCH | `/servicios/:id` | Cambia estado (`avisado`, `realizado`, `descartado`) o datos. |
| GET | `/servicios/:id/whatsapp` | Link `wa.me` con el recordatorio para el cliente. |

---

## Público (sin login)

Lo que ve el cliente desde el link que le llega por WhatsApp. Se identifica solo con el token de la orden.

### `GET /publico/ordenes/:token`
Devuelve solo lo necesario para el cliente: nada de notas internas ni datos de otros clientes.

```json
{
  "taller": { "nombre": "Taller Rodríguez", "telefono": "5492215550000", "logo_url": null },
  "orden": { "numero": 1284, "estado": "en_reparacion", "fecha_estimada_entrega": "2026-10-15" },
  "vehiculo": { "patente": "AE482KT", "marca": "Fiat", "modelo": "Cronos" },
  "presupuesto": { "estado": "aprobado", "total": "486000.00", "items": [ ... ] },
  "linea_de_tiempo": [
    { "estado": "recibido", "fecha": "2026-10-12T11:50:00Z" },
    { "estado": "diagnostico", "fecha": "2026-10-12T14:35:00Z" }
  ]
}
```

### `POST /publico/ordenes/:token/aprobar`
Aprueba el presupuesto. Solo funciona con el presupuesto en `enviado` y la orden en `esperando_aprobacion`; si no, responde `409 PRESUPUESTO_BLOQUEADO`. Pasa la orden a `en_reparacion`, registra los eventos con `usuario_id = NULL` (el taller los ve como hechos por el cliente) y devuelve la vista pública actualizada.

### `POST /publico/ordenes/:token/rechazar`
Rechaza el presupuesto, con un motivo opcional: `{ "motivo": "Lo consulto y les aviso" }`. El presupuesto queda `rechazado`, la orden vuelve a `diagnostico` y el taller puede ajustarlo y reenviarlo.

Los endpoints públicos tienen rate limit de 30 requests por minuto por IP, para evitar que se prueben tokens por fuerza bruta. El presupuesto (`presupuesto`) es `null` mientras el taller no lo envió, y `linea_de_tiempo` solo incluye cambios de estado: nunca notas internas, mecánicos ni el teléfono del cliente. El token tiene que ser de 32 caracteres hexadecimales; si no, responde 400.

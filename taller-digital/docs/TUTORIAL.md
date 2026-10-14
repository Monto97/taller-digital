# Guía para usar Taller Digital

Esta guía es para el que trabaja en el taller: el dueño o el mecánico que está en el mostrador. Está pensada para leerse una vez al principio y volver a mirar los días que algo no sale como se espera.

El sistema reemplaza el cuaderno: cada vehículo que entra queda cargado con una orden, y cada cambio (presupuesto, aprobación, entrega, cobro) se registra solo. El cliente no necesita descargar nada: ve el estado y aprueba el presupuesto desde un link de WhatsApp.

Si recién estás arrancando con tu taller, saltá a [Primer día](#1-primer-día-crear-tu-taller-e-ingresar). Si ya lo venís usando y querés ver qué tiene cada pantalla, andá al [Mapa de pantallas](#mapa-de-pantallas).

---

## Mapa de pantallas

Arriba de todo, en el menú, tenés:

| Pantalla | Para qué |
|---|---|
| **Tablero** | Lo que hay hoy en el taller, por estado. Buscar por patente. |
| **Recibir vehículo** (botón ámbar) | Cargar un vehículo que acaba de entrar. |
| **Historial** | Los trabajos entregados en los últimos 1, 7 o 30 días. |
| **Números** | Cuánto facturaste este mes y cómo venís contra el anterior. |
| **Ajustes** | Conectar Mercado Pago para cobrar online. |
| **Admin** | Solo si sos admin: ver todos los talleres y dar de alta uno nuevo. |

Cuando entrás a un vehículo (desde el tablero o desde una búsqueda) se abren dos pantallas más: **Orden** (lo que se está haciendo ahora) y **Vehículo** (la ficha y todo lo que se le hizo antes).

---

## 1. Primer día: crear tu taller e ingresar

### Si todavía no tenés cuenta

En la pantalla de ingreso, abajo del botón, tocá **Creá tu taller**. Cargá:

- Nombre del taller.
- Teléfono del taller (opcional, pero conviene): es el que ven tus clientes en el link de seguimiento para escribirte.
- Dirección (opcional): aparece abajo del link del cliente.
- Tu nombre, email y una contraseña de al menos 8 caracteres.

Cuando creás el taller entrás directo al tablero. Tu usuario queda como dueño: podés dar de alta mecánicos más adelante.

> En algunas instalaciones el registro público está cerrado. Si al tocar "Creá tu taller" te sale un error de "registro cerrado", pedile al admin que te dé el alta desde el panel de admin.

### Si ya tenés cuenta

Email y contraseña. El sistema recuerda la sesión en ese celular o compu, así que no vas a tener que entrar todos los días. **Salir** (arriba a la derecha) la cierra.

### Dejarlo como app en el celular

Para que el ícono quede en la pantalla de inicio y se abra como una app:

- **Android / Chrome**: menú ⋮ → **Agregar a pantalla de inicio**.
- **iPhone / Safari**: botón compartir → **Agregar a inicio**.

Después se abre a pantalla completa, sin barra del navegador.

---

## 2. Tablero: lo que hay hoy en el taller

Es la primera pantalla cuando entrás. Arriba el día, abajo un resumen rápido (en el taller, listos para retirar, esperando aprobación, entregados hoy) y después cinco columnas con los vehículos:

- **Recibido** — gris. Entró, todavía no se tocó.
- **Diagnóstico** — azul. Lo estás mirando para ver qué hay que hacer.
- **Esperando aprobación** — ámbar. Ya le mandaste presupuesto al cliente.
- **En reparación** — naranja. El cliente aprobó, estás trabajando.
- **Listo** — verde. Está terminado, falta avisarle y entregarlo.

Cada tarjeta muestra la patente, el vehículo, el motivo, el cliente y, si ya hay presupuesto, el total. **Al tocar la tarjeta se abre la orden.**

El tablero se actualiza solo cada minuto, por si otro mecánico movió algo mientras lo mirás.

### Buscar un vehículo

En el buscador de arriba a la derecha, escribí la patente (con o sin espacios, con mayúsculas o minúsculas: se normaliza sola). Puede pasar:

- **Está en el taller:** te lleva directo a su orden en curso.
- **Ya vino antes pero no está hoy:** te lleva a su ficha, donde ves el historial y podés recibirlo de nuevo con un toque.
- **No existe:** te manda directo a **Recibir vehículo** con la patente ya cargada.

---

## 3. Recibir un vehículo

Es la tarea más frecuente del mostrador. Está armada en pasos cortos para que la hagas con el celular en la mano mientras el cliente te habla.

### Paso 1 — la patente

Un solo campo grande en mayúsculas. Escribila como quieras: `AB 123 CD`, `ab123cd`, `AB-123-CD`. Si el sistema no reconoce el formato (ej. una patente extranjera), más abajo te va a aparecer la opción **"Es una patente extranjera o de otro formato"** para seguir igual.

### Paso 2 — datos

Según lo que encuentre:

- **Si el vehículo ya vino antes:** ves marca, modelo y dueño precargados. Solo cargás el motivo de esta visita y los kilómetros.
- **Si es nuevo:** cargás una vez el tipo (auto o moto), marca y modelo (opcionales), y los datos del dueño. **Pedí el celular del dueño:** sin eso no se le pueden mandar avisos por WhatsApp después.

En los dos casos cargás:

- **Qué le pasa o qué hay que hacerle** — es lo que aparece en la tarjeta del tablero. Ej: "hace ruido al frenar", "service 20.000 km".
- **Kilómetros** — opcional pero útil para el historial.

Si el sistema detecta que ese vehículo ya está en el taller con una orden abierta, te avisa y te lleva a esa orden en vez de abrir una nueva.

### Paso 3 — listo

Aparece la patente, el número de orden y dos botones:

- **Avisarle por WhatsApp** — abre WhatsApp con el mensaje escrito ("Hola [Juan], recibimos tu Fiat Cronos en el taller. Cualquier novedad te avisamos."). Solo tenés que tocar enviar.
- **Ver la orden** — abre la orden recién creada.

---

## 4. La orden: el día a día de cada trabajo

Es la pantalla principal del trabajo. Se divide en:

- **Arriba:** patente, nombre del vehículo, número de orden, cuándo entró y con cuántos kilómetros.
- **Izquierda (lo principal):** estado y botones de acción · qué le pasa y diagnóstico · pagos · presupuesto.
- **Derecha:** cliente (con botón para escribirle por WhatsApp) y bitácora (todo lo que fue pasando).

### Mover el estado

Arriba, en el panel de estado, siempre tenés un **botón ámbar grande** con el próximo paso natural. Si estás en "Recibido", dice "Pasar a diagnóstico". Si estás en "En reparación", dice "Marcar como listo". Al lado hay botones secundarios para pasos menos obvios (ej. mandar al revés).

El flujo típico es:

1. **Recibido → Diagnóstico.** Lo estás revisando.
2. **Diagnóstico → Esperando aprobación.** Cargaste el presupuesto y lo mandaste. (Este salto lo hace el botón **"Enviar presupuesto por WhatsApp"** más abajo.)
3. **Esperando aprobación → En reparación.** El cliente aprobó por el link o te dijo por teléfono.
4. **En reparación → Listo.** Terminaste.
5. **Listo → Entregado.** Lo retiraron.

Si el cliente no quiere seguir, podés **cancelar la orden** desde el botón rojo. No se puede deshacer.

Al pasar a **Listo** el sistema te ofrece arriba del panel un botón grande de WhatsApp con el mensaje "Hola [Juan], tu Fiat Cronos ya está listo para retirar". Si lo tocás, se abre WhatsApp y queda registrado en la bitácora. Si lo cerrás con "Ahora no", después lo tenés en la columna derecha, en el panel de **Cliente**, con el botón "Escribirle por WhatsApp".

### Qué le pasa y diagnóstico

El motivo que cargaste al recibir queda ahí arriba y lo podés editar en cualquier momento con **Editar**. Debajo tenés un cuadro de **Diagnóstico** para escribir qué encontraste. Se guarda con el botón **Guardar diagnóstico**.

### Presupuesto

Es la parte más importante de la orden. Agregás ítems de tres tipos:

- **Repuesto** — ej. "Pastillas de freno delanteras", cantidad 1, precio.
- **Mano de obra** — ej. "Cambio de embrague", cantidad 1, precio.
- **Otro** — para lo que no entra en los dos anteriores (traslados, insumos chicos).

Cada ítem tiene cantidad y precio por unidad; el subtotal se calcula solo. Abajo de la lista aparece el **total**.

Cuando el presupuesto está listo y el cliente tiene teléfono cargado, se habilita el botón verde **Enviar presupuesto por WhatsApp**. Al tocarlo:

1. El sistema arma el link al seguimiento, lo mete en un mensaje tipo "Hola [Juan], ya tenemos el presupuesto de tu Fiat Cronos. Mirá el detalle y aprobalo acá: [link]".
2. Se abre WhatsApp con el mensaje escrito. Solo tocás enviar.
3. La orden pasa a **Esperando aprobación**.

Si el cliente te avisó por teléfono que aprueba, tocá directamente **Pasar a en reparación** en el panel de estado: queda registrado como "aprobado por teléfono".

### Modificar un presupuesto ya enviado

Si tocás "Enviar presupuesto por WhatsApp" y después cambiás algún ítem, el presupuesto vuelve a **borrador** y hay que **reenviarlo**. Es a propósito: así el cliente nunca ve un total distinto del que aprobó.

### PDF del presupuesto o del comprobante

Abajo de los ítems hay dos botones:

- **Descargar presupuesto (PDF)** — mientras la orden está abierta. Se abre en una pestaña nueva, lo podés imprimir o guardar.
- **Enviar PDF por WhatsApp** — solo si tenés configurada esa opción. Manda el PDF al cliente desde WhatsApp.

Cuando la orden está entregada, el mismo botón pasa a decir **Descargar comprobante (PDF)**.

### Pagos

El panel de **Pagos** está arriba del presupuesto para que no se te pase. Tiene un chip arriba a la derecha que te dice en qué estás:

- **Sin cobrar** — todavía no hay nada registrado.
- **Debe $X** — cobraste algo pero falta.
- **Pagado** — está todo cobrado (solo si el total es mayor a cero).

Al tocar **Registrar pago** elegís el medio (**Efectivo**, **Transferencia**, **Mercado Pago**, **Tarjeta**, **Otro**), el monto, la fecha y una nota opcional ("seña para encargar repuestos"). Si hay saldo pendiente, aparece un atajo **"Cobrar saldo ($X)"** que te carga el monto justo.

Cada pago queda en la lista con quién lo cargó y cuándo. Lo podés **anular** con la X si te equivocaste.

**Al entregar con deuda:** si tocás "Entregar" y queda saldo, el sistema no te deja pasar al toque: te muestra un panel que te pregunta si querés **registrar el pago primero** o **entregar con saldo pendiente**. Si elegís lo segundo, queda anotado como deuda en la orden.

### Cliente

A la derecha, los datos del cliente. Podés editar nombre y celular con el botón **Editar**. Si el celular no está, no se pueden mandar avisos por WhatsApp y el presupuesto no se puede enviar.

El link **Ver historial del vehículo** abre la ficha del vehículo (ver más abajo).

### Bitácora

Debajo del cliente, la bitácora muestra todo lo que fue pasando con la orden: cuándo entró, cada cambio de estado, cada aviso por WhatsApp, cada pago, cada presupuesto enviado o aprobado. Al final tenés un campo para **agregar una nota manual** (ej. "El cliente pidió que no toquemos el estéreo").

---

## 5. Lo que ve el cliente desde el link

Cuando el cliente abre el link de WhatsApp, no necesita cuenta ni app. Ve:

- **Arriba**, el nombre del taller con el logo.
- Su patente, su nombre y la orden.
- Una **línea de tiempo** con los pasos: recibido, diagnóstico, presupuesto, en reparación, listo, entregado. El paso actual está en naranja, los anteriores en verde con un check. Si todavía no está listo, puede ver una fecha estimada.
- **El presupuesto** con cada ítem y el total.
- **Botón verde grande "Aprobar presupuesto"**. Al tocarlo, la orden pasa automáticamente a "En reparación" y en tu tablero vas a ver el cambio.
- **"Tengo una consulta"** — abre WhatsApp con tu taller y un mensaje tipo "Hola, tengo una consulta sobre el presupuesto de la orden n.º X".
- **"No lo quiero hacer por ahora"** — le pide que (opcionalmente) te cuente el motivo. Si lo manda, lo ves en la bitácora.
- Si tenés Mercado Pago conectado y hay saldo, aparece **Pagar online con Mercado Pago**: va al checkout, y la plata va directo a tu cuenta de MP.
- Al pie, dirección del taller y botón para llamar.

El link queda activo mientras la orden exista. Si la cancelás, el cliente ve un cartel que dice que fue cancelada.

---

## 6. La ficha del vehículo

Entrás desde la orden ("Ver historial del vehículo") o buscando una patente en el tablero (si no tiene orden activa).

A la izquierda tenés **los datos** (patente, tipo, marca, modelo, año, kilómetros, dueño, cuántas visitas tuvo) con un botón **Editar datos**. A la derecha, **todo lo que se le hizo** ordenado del más nuevo al más viejo, con fecha, kilómetros, motivo, los ítems del presupuesto y el total.

Si no hay orden activa, tenés un botón **Recibir este vehículo** que te manda a Recibir con la patente ya cargada (en un toque entra de vuelta al taller).

### Cambiar el dueño (auto vendido)

Al editar los datos, en la sección **Dueño** tenés **"Cambiar dueño (auto vendido)"**. Podés:

- **Buscar un dueño que ya exista** por nombre o celular (sirve para asociarlo a otro cliente del taller).
- **Es un dueño nuevo** — cargás nombre y celular y queda creado al toque.

El cambio no se aplica hasta que tocás **Guardar cambios** del formulario principal, así que podés arrepentirte con **Cancelar cambio de dueño**.

---

## 7. Historial de entregas

Tocá **Historial** en el menú. Arriba elegís el rango: **Hoy**, **7 días** o **30 días**. Abajo, los trabajos entregados agrupados por día, con un total por día.

Cada fila tiene la patente, el vehículo, el cliente, el número de orden, el total y a qué hora se entregó. Al tocarla se abre la orden entregada (ya cerrada, modo lectura).

Sirve para ver "qué entregamos esta semana" sin tener que entrar a cada orden.

---

## 8. Números: cómo venís este mes

Tocá **Números** en el menú. Compara automáticamente **este mes vs. el mes anterior**:

- **Trabajos entregados** — cuántos cerraste.
- **Facturado total** — la suma de todas las órdenes entregadas.
- **Ticket promedio** — qué saliste cobrando por trabajo.
- **Clientes que volvieron** — de los clientes del mes, cuántos ya habían venido antes.

Debajo tenés **Lo que ganaste con tu trabajo**: separa el facturado en mano de obra, repuestos y otros. La idea es que veas en una barra qué parte del total es tuya (mano de obra) y qué parte es plata que pasa de largo (repuestos).

Al final, **Trabajos más frecuentes**: los textos de mano de obra que más se repitieron en el mes. Sirve para ver cuáles son los servicios que más te dan.

Cada tarjeta tiene una flecha verde (sube), roja (baja) o gris (igual) con el porcentaje contra el mes anterior.

---

## 9. Ajustes: conectar Mercado Pago

Tocá **Ajustes** en el menú. Por ahora solo tiene la conexión con Mercado Pago, que sirve para que tus clientes puedan pagar la orden online desde el link que les mandás.

### Primera conexión

1. En el panel **Mercado Pago** tocá **Conectar Mercado Pago**.
2. El navegador te lleva a Mercado Pago. Loguéate con la cuenta que querés que reciba la plata (**ojo:** la que vayas a usar en tu taller, no una personal distinta).
3. Autorizás a Taller Digital.
4. Volvés a Ajustes con el aviso "Mercado Pago quedó conectado. Ya podés cobrar online."

A partir de ese momento, en el link que ven tus clientes aparece un botón **"Pagar online con Mercado Pago"**. **La plata va a tu cuenta de MP: Taller Digital no la toca.**

### Si pasa algo

- **Sin configurar** — el servidor no tiene las credenciales cargadas. Pedile al admin que configure `MP_CLIENT_ID` y `MP_CLIENT_SECRET`.
- **Sin conectar** — las credenciales están, pero vos todavía no autorizaste tu cuenta. Tocá "Conectar Mercado Pago".
- **Conectado** — vas a ver tu número de cuenta MP, si estás en modo producción o pruebas, y desde cuándo. Podés **Volver a conectar** (si cambiaste de cuenta) o **Desconectar**. Si desconectás, los links de pago nuevos dejan de funcionar.

Antes de usarlo con clientes reales conviene hacer una prueba: mandate un presupuesto a vos mismo y verificá que el checkout te dice el monto correcto.

---

## 10. Admin: solo para el que administra el sistema

Si tu usuario es admin, en el menú te aparece **Admin**. Es la vista para quien gestiona todos los talleres (ej. el que vende o soporta Taller Digital).

### Dar de alta un taller nuevo

Tocá **Nuevo taller** y cargá:

- Nombre del taller, celular (para que sus clientes le escriban) y dirección.
- Nombre, email y una contraseña inicial del dueño (podés generar una con **Generar otra**).

Cuando lo creás, aparece abajo un **mensaje de bienvenida ya armado** con los datos y la contraseña, y dos botones:

- **Mandarle los datos por WhatsApp** — abre WhatsApp al celular del taller con el mensaje escrito.
- **Copiar mensaje** — para pegarlo donde quieras.

### Lo que ves de cada taller

Arriba, métricas generales del sistema (talleres totales, activos esta semana, nuevos en 30 días, órdenes totales, tasa de aprobación de presupuestos, avisos de WhatsApp, trabajos entregados).

Debajo, un gráfico de **órdenes por día** en los últimos 30 días.

Después, la tabla de talleres con:

- Nombre, dueño, email, botón de WhatsApp al celular del taller.
- **Uso**: activo esta semana, poco activo, inactivo, nunca entró o deshabilitado.
- Órdenes totales (y cuántas esta semana), cuántos en el taller ahora, vehículos totales, monto entregado, última vez que ingresó, cuándo se dio de alta.
- Botón para **Deshabilitar** o **Habilitar** cada taller (menos el tuyo).

Deshabilitar un taller impide que entre, pero no borra nada: lo podés volver a habilitar cuando quieras.

---

## Consejos para no equivocarse

- **Siempre cargá el celular del dueño.** Sin eso no se pueden mandar avisos ni presupuestos por WhatsApp.
- **Si cambiás un presupuesto ya enviado, reenvialo.** El sistema vuelve a dejarlo en borrador a propósito, así el cliente nunca ve un total distinto del que aprobó.
- **Marcar "Listo" no entrega.** El cliente lo retira cuando pasa; recién ahí tocás **Entregado**. Eso también mueve el chip de pagos a "deuda si falta cobrar".
- **No borres ítems de órdenes entregadas.** Cuando una orden está entregada, el presupuesto queda cerrado. Si hay un error, cargá una nota en la bitácora.
- **Si entregás con saldo**, el sistema te lo dice. Confirmá a conciencia: ese saldo queda como deuda.
- **Buscar por patente es más rápido que ir al tablero.** Escribila en el buscador y el sistema sabe si está en el taller, si ya vino antes o si es nueva.

## Si algo no anda

- **No puedo mandar presupuesto por WhatsApp** → revisá que el cliente tenga celular cargado (desde el panel **Cliente** de la orden) y que haya al menos un ítem.
- **El botón de "Pagar online" no aparece en el link** → no tenés Mercado Pago conectado. Andá a **Ajustes** y conectalo.
- **Un vehículo me dice que ya está en el taller** → es verdad: tiene una orden abierta. Entrá a esa orden en vez de abrir otra.
- **No encuentro la patente que escribí** → probá sin espacios ni guiones. Si es extranjera, usá la opción "Es una patente extranjera o de otro formato" que aparece al recibir.
- **No veo Admin en el menú** → tu usuario no es admin. Pedilo al que administra el sistema.

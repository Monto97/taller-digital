-- =====================================================================
-- Taller Digital — Schema MVP
-- Motor: MySQL 8.0+ (InnoDB, utf8mb4)
-- Convenciones:
--   * Tablas y columnas en snake_case, en español.
--   * Toda tabla de negocio lleva taller_id (multi-tenant por fila).
--   * Montos en DECIMAL(12,2), pesos argentinos.
--   * Fechas en DATETIME guardadas en UTC.
-- =====================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS taller_digital
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE taller_digital;

-- ---------------------------------------------------------------------
-- talleres: cada cliente del SaaS (tenant)
-- ---------------------------------------------------------------------
CREATE TABLE talleres (
  id                     INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nombre                 VARCHAR(120)  NOT NULL,
  slug                   VARCHAR(80)   NOT NULL,
  telefono               VARCHAR(30)   NULL,
  direccion              VARCHAR(200)  NULL,
  logo_url               VARCHAR(500)  NULL,
  proximo_numero_orden   INT UNSIGNED  NOT NULL DEFAULT 1,
  activo                 TINYINT(1)    NOT NULL DEFAULT 1,
  created_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_talleres_slug (slug)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- usuarios: dueño y mecánicos de cada taller
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  taller_id       INT UNSIGNED  NOT NULL,
  nombre          VARCHAR(120)  NOT NULL,
  email           VARCHAR(160)  NOT NULL,
  password_hash   VARCHAR(255)  NOT NULL,
  rol             ENUM('dueno','mecanico') NOT NULL DEFAULT 'mecanico',
  activo          TINYINT(1)    NOT NULL DEFAULT 1,
  ultimo_login_at DATETIME      NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_email (email),
  KEY idx_usuarios_taller (taller_id),
  CONSTRAINT fk_usuarios_taller FOREIGN KEY (taller_id) REFERENCES talleres (id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- clientes: dueños de los vehículos
-- ---------------------------------------------------------------------
CREATE TABLE clientes (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  taller_id   INT UNSIGNED  NOT NULL,
  nombre      VARCHAR(120)  NOT NULL,
  telefono    VARCHAR(30)   NULL COMMENT 'Formato E.164 sin +, ej. 5492215550143, para links wa.me',
  email       VARCHAR(160)  NULL,
  notas       TEXT          NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  DATETIME      NULL,
  PRIMARY KEY (id),
  KEY idx_clientes_taller_nombre (taller_id, nombre),
  KEY idx_clientes_taller_telefono (taller_id, telefono),
  CONSTRAINT fk_clientes_taller FOREIGN KEY (taller_id) REFERENCES talleres (id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- vehiculos: autos y motos. La patente es única por taller.
-- cliente_id = dueño actual (la orden guarda el cliente de ese momento).
-- ---------------------------------------------------------------------
CREATE TABLE vehiculos (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  taller_id    INT UNSIGNED  NOT NULL,
  cliente_id   INT UNSIGNED  NOT NULL,
  patente      VARCHAR(10)   NOT NULL COMMENT 'Normalizada: mayúsculas, sin espacios ni guiones',
  tipo         ENUM('auto','moto') NOT NULL DEFAULT 'auto',
  marca        VARCHAR(60)   NULL,
  modelo       VARCHAR(80)   NULL,
  anio         SMALLINT UNSIGNED NULL,
  color        VARCHAR(40)   NULL,
  km_actual    INT UNSIGNED  NULL,
  notas        TEXT          NULL,
  created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   DATETIME      NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_vehiculos_taller_patente (taller_id, patente),
  KEY idx_vehiculos_cliente (cliente_id),
  CONSTRAINT fk_vehiculos_taller  FOREIGN KEY (taller_id)  REFERENCES talleres (id),
  CONSTRAINT fk_vehiculos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- ordenes: orden de trabajo. Incluye el presupuesto (1 por orden en el MVP).
-- ---------------------------------------------------------------------
CREATE TABLE ordenes (
  id                        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  taller_id                 INT UNSIGNED  NOT NULL,
  numero                    INT UNSIGNED  NOT NULL COMMENT 'Correlativo por taller',
  vehiculo_id               INT UNSIGNED  NOT NULL,
  cliente_id                INT UNSIGNED  NOT NULL,
  mecanico_id               INT UNSIGNED  NULL,
  estado                    ENUM('recibido','diagnostico','esperando_aprobacion',
                                 'en_reparacion','listo','entregado','cancelada')
                                          NOT NULL DEFAULT 'recibido',
  motivo                    TEXT          NOT NULL COMMENT 'Lo que reporta el cliente',
  diagnostico               TEXT          NULL,
  km_ingreso                INT UNSIGNED  NULL,
  presupuesto_estado        ENUM('borrador','enviado','aprobado','rechazado')
                                          NOT NULL DEFAULT 'borrador',
  presupuesto_enviado_at    DATETIME      NULL,
  presupuesto_respondido_at DATETIME      NULL,
  total                     DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT 'Cache de SUM(orden_items), se recalcula en cada cambio de ítems',
  token_publico             CHAR(32)      NOT NULL COMMENT 'Para el link del cliente, sin login',
  fecha_ingreso             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_estimada_entrega    DATE          NULL,
  fecha_entrega             DATETIME      NULL,
  created_at                DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ordenes_taller_numero (taller_id, numero),
  UNIQUE KEY uq_ordenes_token (token_publico),
  KEY idx_ordenes_taller_estado (taller_id, estado),
  KEY idx_ordenes_vehiculo (vehiculo_id, fecha_ingreso),
  KEY idx_ordenes_cliente (cliente_id),
  KEY idx_ordenes_mecanico (mecanico_id),
  CONSTRAINT fk_ordenes_taller   FOREIGN KEY (taller_id)   REFERENCES talleres (id),
  CONSTRAINT fk_ordenes_vehiculo FOREIGN KEY (vehiculo_id) REFERENCES vehiculos (id),
  CONSTRAINT fk_ordenes_cliente  FOREIGN KEY (cliente_id)  REFERENCES clientes (id),
  CONSTRAINT fk_ordenes_mecanico FOREIGN KEY (mecanico_id) REFERENCES usuarios (id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- orden_items: renglones del presupuesto / trabajo realizado
-- ---------------------------------------------------------------------
CREATE TABLE orden_items (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  orden_id         INT UNSIGNED  NOT NULL,
  tipo             ENUM('repuesto','mano_de_obra','otro') NOT NULL,
  descripcion      VARCHAR(200)  NOT NULL,
  cantidad         DECIMAL(10,2) NOT NULL DEFAULT 1,
  precio_unitario  DECIMAL(12,2) NOT NULL,
  posicion         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_items_orden (orden_id, posicion),
  CONSTRAINT fk_items_orden FOREIGN KEY (orden_id) REFERENCES ordenes (id) ON DELETE CASCADE,
  CONSTRAINT chk_items_cantidad CHECK (cantidad > 0),
  CONSTRAINT chk_items_precio   CHECK (precio_unitario >= 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- orden_eventos: bitácora de la orden (alimenta la línea de tiempo
-- del link público y la auditoría). usuario_id NULL = acción del cliente.
-- ---------------------------------------------------------------------
CREATE TABLE orden_eventos (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  orden_id      INT UNSIGNED  NOT NULL,
  usuario_id    INT UNSIGNED  NULL,
  tipo          ENUM('creada','cambio_estado','presupuesto_enviado','presupuesto_aprobado',
                     'presupuesto_rechazado','aviso_whatsapp','nota') NOT NULL,
  estado_desde  VARCHAR(30)   NULL,
  estado_hasta  VARCHAR(30)   NULL,
  detalle       VARCHAR(500)  NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_eventos_orden (orden_id, created_at),
  CONSTRAINT fk_eventos_orden   FOREIGN KEY (orden_id)   REFERENCES ordenes (id) ON DELETE CASCADE,
  CONSTRAINT fk_eventos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- servicios_programados: próximos services para recordar al cliente
-- ---------------------------------------------------------------------
CREATE TABLE servicios_programados (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  taller_id        INT UNSIGNED  NOT NULL,
  vehiculo_id      INT UNSIGNED  NOT NULL,
  orden_origen_id  INT UNSIGNED  NULL COMMENT 'Orden en la que se programó',
  descripcion      VARCHAR(200)  NOT NULL,
  fecha_estimada   DATE          NULL,
  km_estimado      INT UNSIGNED  NULL,
  estado           ENUM('pendiente','avisado','realizado','descartado') NOT NULL DEFAULT 'pendiente',
  avisado_at       DATETIME      NULL,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_servicios_taller_fecha (taller_id, estado, fecha_estimada),
  KEY idx_servicios_vehiculo (vehiculo_id),
  CONSTRAINT fk_servicios_taller   FOREIGN KEY (taller_id)       REFERENCES talleres (id),
  CONSTRAINT fk_servicios_vehiculo FOREIGN KEY (vehiculo_id)     REFERENCES vehiculos (id),
  CONSTRAINT fk_servicios_orden    FOREIGN KEY (orden_origen_id) REFERENCES ordenes (id) ON DELETE SET NULL,
  CONSTRAINT chk_servicios_meta    CHECK (fecha_estimada IS NOT NULL OR km_estimado IS NOT NULL)
) ENGINE=InnoDB;

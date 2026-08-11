# Mozart Kiosk

Sistema de gestión integral para kioscos. Administrá el inventario, generá pedidos de compra, escaneá productos con código de barras y controlá el stock con alertas de faltantes. Incluye dos roles: **Empleado** (solo escáner y generación de tickets) y **Dueño** (acceso total con autorización).

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | HTML, CSS, JavaScript (vanilla) |
| Backend | PHP 8.2 + Apache |
| Base de datos | MariaDB 11 |
| Contenedores | Docker + Docker Compose |

## Características

- **Login con roles:** Empleado y Dueño. El empleado accede sin contraseña; el Dueño requiere la clave `kiosco2026`.
- **Autenticación cruzada:** Un empleado puede realizar acciones restringidas (editar stock, resolver reclamos) introduciendo la contraseña del Dueño en un modal.
- **Gestión de stock:** Tabla de inventario con búsqueda por nombre o SKU, indicador visual de stock crítico (rojo) y exportación a CSV.
- **Pre-pedidos:** Generá intenciones de compra enviadas al proveedor; el stock solo se actualiza al confirmar la recepción.
- **Recepción y reclamos:** Al llegar la mercadería, aprobá el pedido (`Llegó Bien`) o reportá defectos (reposición o reembolso).
- **POS con escáner:** Cargá productos ingresando el código EAN-13 (13 dígitos numéricos) para generar un comprobante de pedido de compra que descuenta el stock.
- **Tema claro/oscuro:** Se guarda en `localStorage` y persiste entre sesiones.
- **Rate limiting:** Bloqueo temporal tras 5 intentos fallidos de login.
- **Protección CSRF:** Token en cada petición POST.

## Estructura del proyecto

```
Kiosco/
├── docker-compose.yml      # Orquestación de servicios (db + web)
├── Dockerfile.apache       # Imagen PHP 8.2 + Apache + extensiones MySQL
├── init-db/
│   └── Bs.sql              # Esquema y datos semilla
└── public-html/
    ├── index.html           # Interfaz principal
    ├── app.js               # Lógica de UI (inventario, pedidos, POS)
    ├── auth.js              # Autenticación y control de sesión
    ├── db.js                # Cliente API (fetch + CSRF)
    ├── style.css            # Estilos + tema oscuro
    └── api/
        └── index.php        # Backend PHP (CRUD, sesiones, rate limiting)
```

## Tablas de la base de datos

- **roles** — Roles del sistema (Director, Secretaría, Preceptor, Dueño, Empleado).
- **usuarios** — Cuentas con hash bcrypt.
- **proveedores** — Datos de los distribuidores.
- **productos** — Catálogo con SKU EAN-13, precio, stock y stock mínimo.
- **pedidos** — Estado del flujo: pendiente → ok / defecto_pendiente → resuelto_reposicion / resuelto_reembolso.

## Cómo ejecutarlo

### Requisitos previos

- [Docker](https://docs.docker.com/get-docker/) y [Docker Compose](https://docs.docker.com/compose/install/) instalados.

### Inicio rápido

```bash
# Desde la raíz del proyecto
docker compose up -d
```

Esto levanta dos contenedores:

| Servicio | Puerto |
|---|---|
| `kiosco-db` (MariaDB) | `3306` |
| `kiosco-web` (Apache + PHP) | `8080` |

Abri en tu navegador: **http://localhost:8080**

### Datos de acceso (demo)

| Rol | Contraseña |
|---|---|
| Empleado | (sin contraseña, dejar vacío) |
| Dueño | `kiosco2026` |

### Datos semilla incluidos

4 proveedores, 5 productos con SKUs EAN-13, y un usuario de cada rol ya creados en la BD.

### Detener y eliminar los contenedores

```bash
docker compose down          # detener contenedores
docker compose down -v       # detener + eliminar volumen de datos
```

## Personalización de variables de entorno

Podés crear un archivo `.env` en la raíz del proyecto:

```env
MARIADB_ROOT_PASSWORD=tu_contraseña_root
MARIADB_DATABASE=gestion_tecnica_n3
DB_USER=kiosco_user
DB_PASSWORD=kiosco_pass
```

Si no se define, se usan los valores por defecto indicados en `docker-compose.yml`.

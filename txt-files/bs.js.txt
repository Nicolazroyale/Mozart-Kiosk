const DB_KEYS = {
    productos: 'kiosco_productos',
    proveedores: 'kiosco_proveedores',
    pedidos: 'kiosco_pedidos',
    ownerHash: 'kiosco_owner_hash',
    nextId: 'kiosco_next_id',
};

// Hash SHA-256 de la contraseña del Dueño: "kiosco2026"
const OWNER_HASH_DEFAULT = 'ae4bfb5ef22d632207de75def723f8a3e63f7fb52b98937ad57a18586b9c4949';

function leer(clave, valorPorDefecto) {
    const raw = localStorage.getItem(clave);
    return raw ? JSON.parse(raw) : valorPorDefecto;
}

function escribir(clave, valor) {
    localStorage.setItem(clave, JSON.stringify(valor));
}

function siguienteId() {
    const actual = parseInt(localStorage.getItem(DB_KEYS.nextId) || '1000', 10);
    localStorage.setItem(DB_KEYS.nextId, actual + 1);
    return actual;
}

/** Carga los datos de ejemplo la primera vez que se abre el sistema. */
function inicializarDatos() {
    if (!localStorage.getItem(DB_KEYS.proveedores)) {
        escribir(DB_KEYS.proveedores, [
            { id: 1, empresa: 'Distribuidora Gaseosas SRL', rubro: 'Gaseosas', contacto: 'Juan Pérez', email: 'juan.perez@gaseosas.com', telefono: '11-1234-5678' },
            { id: 2, empresa: 'Cervecería Nacional', rubro: 'Alcohol', contacto: 'María Gómez', email: 'ventas@cervezanacional.com', telefono: '11-9876-5432' },
            { id: 3, empresa: 'Mayorista Dulces del Sur', rubro: 'Golosinas', contacto: 'Carla Ruiz', email: 'pedidos@dulcesdelsur.com', telefono: '11-5555-2020' },
            { id: 4, empresa: 'Lácteos La Serrana', rubro: 'Lácteos', contacto: 'Pedro Sosa', email: 'contacto@laserrana.com', telefono: '11-4444-1010' },
        ]);
    }
    if (!localStorage.getItem(DB_KEYS.productos)) {
        escribir(DB_KEYS.productos, [
            { id: 1, sku: 'K-001', nombre: 'Coca-Cola 2L', stock: 4, stock_minimo: 10, proveedor_id: 1 },
            { id: 2, sku: 'K-002', nombre: 'Alfajor Triple', stock: 2, stock_minimo: 8, proveedor_id: 3 },
            { id: 3, sku: 'K-003', nombre: 'Cerveza Quilmes 1L', stock: 12, stock_minimo: 6, proveedor_id: 2 },
            { id: 4, sku: 'K-004', nombre: 'Leche Entera 1L', stock: 3, stock_minimo: 6, proveedor_id: 4 },
            { id: 5, sku: 'K-005', nombre: 'Agua Mineral 1.5L', stock: 20, stock_minimo: 8, proveedor_id: 1 },
        ]);
    }
    if (!localStorage.getItem(DB_KEYS.pedidos)) {
        escribir(DB_KEYS.pedidos, []);
    }
    if (!localStorage.getItem(DB_KEYS.ownerHash)) {
        localStorage.setItem(DB_KEYS.ownerHash, OWNER_HASH_DEFAULT);
    }
    if (!localStorage.getItem(DB_KEYS.nextId)) {
        localStorage.setItem(DB_KEYS.nextId, '1000');
    }
}

// ---------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------

async function dbListarProductos() {
    return leer(DB_KEYS.productos, []).map((p) => ({ ...p, critico: p.stock < p.stock_minimo }));
}

async function dbListarFaltantes() {
    const productos = await dbListarProductos();
    const proveedores = await dbListarProveedores();
    return productos
        .filter((p) => p.critico)
        .map((p) => ({ ...p, proveedor_nombre: proveedores.find((pr) => pr.id === p.proveedor_id)?.empresa || '—' }))
        .sort((a, b) => (a.stock / a.stock_minimo) - (b.stock / b.stock_minimo));
}

async function dbModificarStock(productoId, nuevoStock) {
    const productos = leer(DB_KEYS.productos, []);
    const prod = productos.find((p) => p.id === productoId);
    if (!prod) throw new Error('Producto inexistente.');
    prod.stock = nuevoStock;
    escribir(DB_KEYS.productos, productos);
    return prod;
}

async function dbSumarStock(productoId, cantidad) {
    const productos = leer(DB_KEYS.productos, []);
    const prod = productos.find((p) => p.id === productoId);
    if (!prod) throw new Error('Producto inexistente.');
    prod.stock += cantidad;
    escribir(DB_KEYS.productos, productos);
    return prod;
}

async function dbRegistrarVenta(sku, cantidad) {
    const productos = leer(DB_KEYS.productos, []);
    const prod = productos.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
    if (!prod) throw new Error(`No existe ningún producto con el código "${sku}".`);
    if (prod.stock < cantidad) throw new Error(`Stock insuficiente de ${prod.nombre} (disponible: ${prod.stock}).`);
    prod.stock -= cantidad;
    escribir(DB_KEYS.productos, productos);
    return prod;
}

// ---------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------

async function dbListarProveedores() {
    return leer(DB_KEYS.proveedores, []);
}

async function dbCrearProveedor(datos) {
    if (!datos.empresa || !datos.empresa.trim()) throw new Error('El nombre de la empresa es obligatorio.');
    const proveedores = leer(DB_KEYS.proveedores, []);
    const nuevo = { id: siguienteId(), ...datos };
    proveedores.push(nuevo);
    escribir(DB_KEYS.proveedores, proveedores);
    return nuevo;
}

async function dbListarPedidos() {
    const pedidos = leer(DB_KEYS.pedidos, []);
    const productos = leer(DB_KEYS.productos, []);
    const proveedores = leer(DB_KEYS.proveedores, []);
    return pedidos
        .map((p) => ({
            ...p,
            producto_nombre: productos.find((x) => x.id === p.producto_id)?.nombre || '—',
            proveedor_nombre: proveedores.find((x) => x.id === p.proveedor_id)?.empresa || '—',
        }))
        .sort((a, b) => b.id - a.id);
}

async function dbCrearPedido(productoId, proveedorId, cantidad) {
    const productos = leer(DB_KEYS.productos, []);
    const prod = productos.find((p) => p.id === productoId);
    if (!prod) throw new Error('Producto inexistente.');
    const pedidos = leer(DB_KEYS.pedidos, []);
    const nuevo = {
        id: siguienteId(),
        producto_id: productoId,
        proveedor_id: proveedorId || prod.proveedor_id,
        cantidad,
        estado: 'pendiente', 
        detalle_defecto: null,
        resolucion_solicitada: null,
        fecha_creacion: new Date().toISOString(),
        fecha_cierre: null,
    };
    pedidos.push(nuevo);
    escribir(DB_KEYS.pedidos, pedidos);
    return nuevo;
}

async function dbCheckOk(pedidoId) {
    const pedidos = leer(DB_KEYS.pedidos, []);
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido) throw new Error('Pedido inexistente.');
    if (pedido.estado !== 'pendiente') throw new Error('Este pedido ya fue procesado.');
    await dbSumarStock(pedido.producto_id, pedido.cantidad);
    pedido.estado = 'ok';
    pedido.fecha_cierre = new Date().toISOString();
    escribir(DB_KEYS.pedidos, pedidos);
    return pedido;
}

/** Reportar mercadería rota/defectuosa. El stock NO se toca todavía. */
async function dbReportarDefecto(pedidoId, detalle, resolucionSolicitada) {
    if (!detalle || !detalle.trim()) throw new Error('Hay que describir el problema para poder reclamarlo.');
    const pedidos = leer(DB_KEYS.pedidos, []);
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido || pedido.estado !== 'pendiente') throw new Error('Este pedido no está disponible para reclamo.');
    pedido.estado = 'defecto_pendiente';
    pedido.detalle_defecto = detalle;
    pedido.resolucion_solicitada = resolucionSolicitada;
    escribir(DB_KEYS.pedidos, pedidos);
    return pedido;
}

/** Cierra un reclamo ya resuelto por el proveedor. Si fue "reposición" y
 *  llegó bien, ahí sí se suma el stock; si fue "reembolso", se cierra sin
 *  tocar stock (nunca llegó mercadería). */
async function dbResolverReclamo(pedidoId) {
    const pedidos = leer(DB_KEYS.pedidos, []);
    const pedido = pedidos.find((p) => p.id === pedidoId);
    if (!pedido || pedido.estado !== 'defecto_pendiente') throw new Error('Este pedido no tiene un reclamo pendiente.');
    if (pedido.resolucion_solicitada === 'reposicion') {
        await dbSumarStock(pedido.producto_id, pedido.cantidad);
        pedido.estado = 'resuelto_reposicion';
    } else {
        pedido.estado = 'resuelto_reembolso';
    }
    pedido.fecha_cierre = new Date().toISOString();
    escribir(DB_KEYS.pedidos, pedidos);
    return pedido;
}

function dbObtenerOwnerHash() {
    return localStorage.getItem(DB_KEYS.ownerHash) || OWNER_HASH_DEFAULT;
}

const API_BASE = '/api/index.php';

// Token CSRF obtenido del backend
let csrfToken = null;

async function obtenerTokenCSRF() {
    if (csrfToken) return csrfToken;
    try {
        const res = await api('csrf_token');
        csrfToken = res.token;
        return csrfToken;
    } catch (e) {
        csrfToken = null;
        throw e;
    }
}

async function api(action, data = null, params = {}) {
    let url = API_BASE + '?action=' + encodeURIComponent(action);
    for (const [k, v] of Object.entries(params)) {
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(v);
    }
    const opts = {
        headers: {
            'X-CSRF-Token': csrfToken || '',
            'Content-Type': 'application/json'
        },
        credentials: 'same-origin'
    };
    if (data !== null) {
        opts.method = 'POST';
        opts.body = JSON.stringify(data);
    } else {
        opts.method = 'GET';
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { json = { error: 'Respuesta inválida del servidor' }; }
    if (!res.ok || json.error) {
        if (json.error && json.error.includes('CSRF')) {
            csrfToken = null;
        }
        throw new Error(json.error || `Error ${res.status}`);
    }
    return json;
}

async function dbListarProductos() {
  const data = await api('productos');
  return data.map((p) => ({
    ...p,
    critico: parseInt(p.stock) < parseInt(p.stock_minimo),
  }));
}

async function dbListarProveedores() {
  return api('proveedores');
}

async function dbListarPedidos() {
  return api('pedidos', null, { limit: 15 });
}

async function dbListarFaltantes() {
  const productos = await dbListarProductos();
  const proveedores = await dbListarProveedores();
  return productos
    .filter((p) => p.critico)
    .map((p) => ({
      ...p,
      proveedor_nombre: proveedores.find((pr) => parseInt(pr.id) === parseInt(p.proveedor_id))?.empresa || '—',
    }))
    .sort((a, b) => (a.stock / a.stock_minimo) - (b.stock / b.stock_minimo));
}

async function dbModificarStock(productoId, nuevoStock, passwordDueno = null) {
  const payload = { producto_id: productoId, stock: nuevoStock };
  if (passwordDueno) payload.password_dueno = passwordDueno;
  return api('modificar_stock', payload);
}

async function dbSumarStock(productoId, cantidad, passwordDueno = null) {
  const payload = { producto_id: productoId, cantidad };
  if (passwordDueno) payload.password_dueno = passwordDueno;
  return api('sumar_stock', payload);
}

async function dbCrearPedido(productoId, proveedorId, cantidad) {
  return api('crear_pedido', { producto_id: productoId, proveedor_id: proveedorId, cantidad });
}

async function dbCheckOk(pedidoId) {
  return api('check_ok', { pedido_id: pedidoId });
}

async function dbReportarDefecto(pedidoId, detalle, resolucionSolicitada) {
  return api('reportar_defecto', { pedido_id: pedidoId, detalle, resolucion_solicitada: resolucionSolicitada });
}

async function dbResolverReclamo(pedidoId, passwordDueno = null) {
  const payload = { pedido_id: pedidoId };
  if (passwordDueno) payload.password_dueno = passwordDueno;
  return api('resolver_reclamo', payload);
}

async function dbBuscarProductoSku(sku) {
  return api('buscar_sku', null, { sku });
}

async function dbGenerarPedidoCompra(items) {
  return api('generar_pedido_compra', { items });
}

async function dbAgregarProducto(sku, nombre, precio, stock, stockMinimo, proveedorId) {
  return api('agregar_producto', { sku, nombre, precio, stock, stock_minimo: stockMinimo, proveedor_id: proveedorId });
}

function inicializarDatos() {}


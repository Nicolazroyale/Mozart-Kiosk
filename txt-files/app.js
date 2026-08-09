// UI a partir de db.js y maneja login /
// autenticación cruzada con auth.js. No hay ningún fetch() todavía porque
// no hay backend: todo corre en el navegador.

let authModo = null;           // 'switch' | 'accion'
let authResolverPendiente = null;
let carritoPos = [];
let productosCache = [];       // para búsqueda de inventario

// ---------------------------------------------------------------------
// Utilidades de seguridad
// ---------------------------------------------------------------------

function escaparHTML(texto) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(texto ?? ''));
    return div.innerHTML;
}

function escaparCSV(valor) {
    const texto = String(valor ?? '');
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// ---------------- Modo Oscuro ----------------
function obtenerTema() {
    return localStorage.getItem('kiosco_tema') || 'light';
}

function aplicarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('kiosco_tema', tema);
    const btn = document.getElementById('btnToggleTema');
    if (btn) {
        btn.innerText = tema === 'dark' ? '☀️' : '🌙';
        btn.title = tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    }
}

function toggleTema() {
    const temaActual = obtenerTema();
    aplicarTema(temaActual === 'dark' ? 'light' : 'dark');
}

document.addEventListener('DOMContentLoaded', async () => {
    inicializarDatos();
    wireLogin();
    wireHeader();
    wireModales();
    wireNavegacionPestanas();
    wirePedidoForm();
    wireDefectoForm();
    wireExportarFaltantes();
    wireFaltantes();
    wirePosScanner();
    wireAgregarProducto();
    wireBuscarInventario();
    wireToggleTema();

    // Aplicar tema guardado antes de mostrar la app
    aplicarTema(obtenerTema());

    const sesion = await refrescarSesionBackend();
    if (sesion && sesion.autenticado) {
        mostrarApp();
    } else {
        mostrarLogin();
    }
});

function wireToggleTema() {
    const btn = document.getElementById('btnToggleTema');
    if (btn) {
        btn.addEventListener('click', toggleTema);
    }
}

function wireNavegacionPestanas() {
    const tabGestion = document.getElementById('tabNavGestion');
    const tabPos = document.getElementById('tabNavPos');
    const vistaGestion = document.getElementById('vistaGestion');
    const vistaPos = document.getElementById('vistaPos');

    if (!tabGestion || !tabPos) return;

    tabGestion.addEventListener('click', () => {
        tabGestion.classList.add('activo');
        tabPos.classList.remove('activo');
        vistaGestion.style.display = 'block';
        vistaPos.style.display = 'none';
    });

    tabPos.addEventListener('click', () => {
        tabPos.classList.add('activo');
        tabGestion.classList.remove('activo');
        vistaGestion.style.display = 'none';
        vistaPos.style.display = 'block';
        document.getElementById('inputSkuEscaneo').focus();
    });
}

function wireLogin() {
    const tabEmpleado = document.getElementById('tabLoginEmpleado');
    const tabDueno = document.getElementById('tabLoginDueno');
    const campoPassword = document.getElementById('campoPasswordLogin');

    tabEmpleado.addEventListener('click', () => {
        tabEmpleado.classList.add('activo');
        tabDueno.classList.remove('activo');
        campoPassword.style.display = 'none';
    });
    tabDueno.addEventListener('click', () => {
        tabDueno.classList.add('activo');
        tabEmpleado.classList.remove('activo');
        campoPassword.style.display = 'block';
    });

    document.getElementById('formLogin').addEventListener('submit', async (e) => {
        e.preventDefault();
        const rol = document.getElementById('tabLoginDueno').classList.contains('activo') ? 'dueno' : 'empleado';
        const password = document.getElementById('inputPasswordLogin').value;
        const errorBox = document.getElementById('errorLogin');
        errorBox.innerText = '';
        try {
            await login(rol, password);
            document.getElementById('inputPasswordLogin').value = '';
            mostrarApp();
        } catch (err) {
            errorBox.innerText = err.message;
        }
    });
}

function mostrarLogin() {
    document.getElementById('pantallaLogin').style.display = 'flex';
    document.getElementById('appPrincipal').style.display = 'none';
}

async function mostrarApp() {
    document.getElementById('pantallaLogin').style.display = 'none';
    document.getElementById('appPrincipal').style.display = 'block';
    await refrescarUiSesion();
    aplicarPermisosPorRol();
    await Promise.all([cargarInventario(), cargarPedidos(), cargarFaltantes()]);
}

// ---------------------------------------------------------------------
// Header: rol activo, cambio de cuenta, cierre de sesión
// ---------------------------------------------------------------------

async function refrescarUiSesion() {
    const sesion = obtenerSesion();
    const etiqueta = document.getElementById('uiRolActual');
    etiqueta.innerText = sesion.nombre;
    etiqueta.style.color = sesion.rol === 'dueno' ? '#bff5d6' : '';
    aplicarPermisosPorRol();
}

function aplicarPermisosPorRol() {
    const sesion = obtenerSesion();
    const esDueno = sesion.rol === 'dueno';
    const tabGestion = document.getElementById('tabNavGestion');
    const tabPos = document.getElementById('tabNavPos');
    const vistaGestion = document.getElementById('vistaGestion');
    const vistaPos = document.getElementById('vistaPos');
    const btnFaltantes = document.getElementById('btnFaltantes');
    const btnAgregar = document.getElementById('btnAgregarProducto');

    if (!tabGestion || !tabPos) return;

    if (esDueno) {
        // Dueño: acceso total (Gestión de stock + POS)
        tabGestion.style.display = '';
        tabPos.style.display = '';
        if (btnFaltantes) btnFaltantes.style.display = '';
        if (btnAgregar) btnAgregar.style.display = '';
        // Si no hay pestaña activa visible, ir a Gestión
        if (vistaGestion.style.display === 'none' && vistaPos.style.display === 'none') {
            tabGestion.click();
        }
    } else {
        // Empleado: solo puede escanear y generar órdenes de compra
        tabGestion.style.display = 'none';
        tabPos.style.display = '';
        if (btnFaltantes) btnFaltantes.style.display = 'none';
        if (btnAgregar) btnAgregar.style.display = 'none';
        // Forzar vista POS
        tabPos.classList.add('activo');
        tabGestion.classList.remove('activo');
        vistaGestion.style.display = 'none';
        vistaPos.style.display = 'block';
        const inputSku = document.getElementById('inputSkuEscaneo');
        if (inputSku) inputSku.focus();
    }
}

function wireHeader() {
    document.getElementById('btnCambiarUsuario').addEventListener('click', async () => {
        if (obtenerSesion().rol === 'dueno') {
            await cambiarRol('empleado');
            refrescarUiSesion();
            return;
        }
        document.getElementById('authTitulo').innerText = 'Cambiar a cuenta de Dueño';
        document.getElementById('authMensaje').innerText = 'Ingresá la contraseña del Dueño para tomar el control total del sistema.';
        document.getElementById('errorAuth').innerText = '';
        authModo = 'switch';
        abrirModal('modalAuth');
    });

    document.getElementById('btnCerrarSesion').addEventListener('click', async () => {
        await cerrarSesion();
        mostrarLogin();
    });
}

function abrirModal(id) { document.getElementById(id).classList.add('activo'); }
function cerrarModales() {
    document.querySelectorAll('.modal-fondo').forEach((el) => el.classList.remove('activo'));
}

function wireModales() {
    document.querySelectorAll('[data-cerrar]').forEach((el) => el.addEventListener('click', () => {
        cerrarModales();
        if (authResolverPendiente) { authResolverPendiente(null); authResolverPendiente = null; }
    }));

    document.getElementById('formAuth').addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('inputPassDueno').value;
        const errorBox = document.getElementById('errorAuth');

        if (authModo === 'switch') {
            try {
                await cambiarRol('dueno', password);
                document.getElementById('inputPassDueno').value = '';
                cerrarModales();
                refrescarUiSesion();
            } catch (err) {
                errorBox.innerText = err.message;
            }
            return;
        }

        if (authModo === 'accion') {
            const ok = await verificarPasswordDueno(password);
            document.getElementById('inputPassDueno').value = '';
            if (!ok) { errorBox.innerText = 'Contraseña incorrecta.'; return; }
            cerrarModales();
            if (authResolverPendiente) { authResolverPendiente(password); authResolverPendiente = null; }
        }
    });
}

/** Devuelve true/string si la acción está autorizada: directo (true) si la sesión ya es
 *  Dueño, o la contraseña ingresada si es un Empleado requiriendo autorización. Devuelve null/false si se cancela. */
function requiereAutorizacionDueno(mensaje) {
    if (obtenerSesion().rol === 'dueno') return Promise.resolve(true);
    return new Promise((resolve) => {
        document.getElementById('authTitulo').innerText = 'Autorización del Dueño requerida';
        document.getElementById('authMensaje').innerText = mensaje;
        document.getElementById('errorAuth').innerText = '';
        authModo = 'accion';
        authResolverPendiente = resolve;
        abrirModal('modalAuth');
    });
}

// ---------------------------------------------------------------------
// Inventario + Pre-Pedido
// ---------------------------------------------------------------------

async function cargarInventario() {
    const [productos, proveedores] = await Promise.all([dbListarProductos(), dbListarProveedores()]);
    productosCache = productos;
    renderInventario(productos, proveedores);
    actualizarSelectPedidos(productos, proveedores);
}

function renderInventario(productos, proveedores) {
    const tbody = document.getElementById('tablaInventario');
    tbody.innerHTML = '';
    if (productos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="texto-mudo" style="text-align:center;">No hay productos registrados.</td></tr>';
        return;
    }
    productos.forEach((p) => {
        const proveedor = proveedores.find((pr) => pr.id === p.proveedor_id);
        const tr = document.createElement('tr');
        const precio = parseFloat(p.precio || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const nombreEscapado = escaparHTML(p.nombre);
        const skuEscapado = escaparHTML(p.sku);
        const empresaEscapada = proveedor ? escaparHTML(proveedor.empresa) : '—';
        tr.innerHTML = `
            <td><code>${skuEscapado}</code></td>
            <td>${nombreEscapado}</td>
            <td><strong>$ ${precio}</strong></td>
            <td class="${p.critico ? 'stock-critico' : 'stock-ok'}">${p.stock}${p.critico ? ' (Bajo)' : ''}</td>
            <td>${empresaEscapada}</td>
            <td><button class="btn btn-secundario btn-mini" data-editar="${escaparHTML(String(p.id))}" data-nombre="${nombreEscapado}" data-stock="${p.stock}">Editar</button></td>
        `;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => solicitarEdicionStock(parseInt(btn.dataset.editar, 10), btn.dataset.nombre, btn.dataset.stock));
    });
}

function filtrarInventario() {
    const busqueda = document.getElementById('inputBuscarProducto')?.value.toLowerCase().trim() || '';
    const filtrados = productosCache.filter((p) =>
        p.nombre.toLowerCase().includes(busqueda) ||
        p.sku.includes(busqueda)
    );
    dbListarProveedores().then((proveedores) => {
        renderInventario(filtrados, proveedores);
    });
}

function actualizarSelectPedidos(productos, proveedores) {
    const select = document.getElementById('selectProductoPedido');
    if (!select) return;
    const valorPrevio = select.value;
    select.innerHTML = '<option value="">Seleccionar producto...</option>';
    productos.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.dataset.proveedorId = p.proveedor_id;
        opt.innerText = `${p.sku} — ${p.nombre} (stock: ${p.stock})`;
        select.appendChild(opt);
    });
    if (valorPrevio) select.value = valorPrevio;
    actualizarInfoProveedorPedido();
}

async function solicitarEdicionStock(id, nombre, stockActual) {
    const nuevo = window.prompt(`Nuevo stock para "${nombre}":`, stockActual);
    if (nuevo === null || nuevo.trim() === '' || isNaN(nuevo)) return;

    const auth = await requiereAutorizacionDueno('El Empleado necesita la contraseña del Dueño para modificar el stock manualmente.');
    if (!auth) return;
    try {
        const passDueno = typeof auth === 'string' ? auth : null;
        await dbModificarStock(id, parseInt(nuevo, 10), passDueno);
        await cargarInventario();
        await cargarFaltantes();
    } catch (err) {
        alert(err.message);
    }
}

function actualizarInfoProveedorPedido() {
    const select = document.getElementById('selectProductoPedido');
    const info = document.getElementById('infoProveedorPedido');
    const opt = select.options[select.selectedIndex];
    if (opt && opt.value) {
        dbListarProveedores().then((proveedores) => {
            const prov = proveedores.find((p) => p.id === parseInt(opt.dataset.proveedorId, 10));
            info.innerText = prov ? `Se le pedirá a: ${prov.empresa} (${prov.email})` : '';
        });
    } else {
        info.innerText = '';
    }
}

function wirePedidoForm() {
    document.getElementById('selectProductoPedido').addEventListener('change', actualizarInfoProveedorPedido);

    document.getElementById('formPedido').addEventListener('submit', async (e) => {
        e.preventDefault();
        const select = document.getElementById('selectProductoPedido');
        const productoId = parseInt(select.value, 10);
        const cantidad = parseInt(document.getElementById('inputCantidadPedido').value, 10);
        const errorBox = document.getElementById('errorPedido');
        errorBox.innerText = '';
        if (!productoId) { errorBox.innerText = 'Elegí un producto.'; return; }
        try {
            const opt = select.options[select.selectedIndex];
            await dbCrearPedido(productoId, parseInt(opt.dataset.proveedorId, 10), cantidad);
            e.target.reset();
            document.getElementById('inputCantidadPedido').value = 10;
            await cargarPedidos();
        } catch (err) {
            errorBox.innerText = err.message;
        }
    });
}

const ETIQUETAS_ESTADO = {
    pendiente: 'Esperando revisión',
    ok: 'Recibido correctamente',
    defecto_pendiente: 'Reclamo en curso',
    resuelto_reposicion: 'Resuelto (reposición recibida)',
    resuelto_reembolso: 'Resuelto (reembolso)',
};

async function cargarPedidos() {
    const pedidos = await dbListarPedidos();
    const cont = document.getElementById('listaPedidos');
    cont.innerHTML = '';
    if (pedidos.length === 0) {
        cont.innerHTML = '<p class="texto-mudo">No hay pedidos registrados todavía.</p>';
        return;
    }
    pedidos.forEach((p) => {
        const div = document.createElement('div');
        div.className = 'pedido-card';
        const productoNombreEscapado = escaparHTML(p.producto_nombre || '');
        const proveedorNombreEscapado = escaparHTML(p.proveedor_nombre || '');
        const detalleEscapado = escaparHTML(p.detalle_defecto || '');
        const resolucionEscapada = escaparHTML(p.resolucion_solicitada || '');
        let acciones = '';
        if (p.estado === 'pendiente') {
            acciones = `
                <div class="acciones">
                    <button class="btn btn-exito btn-mini" data-check="${escaparHTML(String(p.id))}">Llegó Bien (Aprobar)</button>
                    <button class="btn btn-peligro btn-mini" data-defecto="${escaparHTML(String(p.id))}">Reportar Defecto</button>
                </div>`;
        } else if (p.estado === 'defecto_pendiente') {
            acciones = `
                <div class="acciones">
                    <button class="btn btn-primario btn-mini" data-resolver="${escaparHTML(String(p.id))}">Confirmar resolución del proveedor</button>
                </div>
                <p class="texto-mudo">Detalle: ${detalleEscapado} — Solicitado: ${resolucionEscapada}</p>`;
        }
        div.innerHTML = `
            <strong>Pedido #${escaparHTML(String(p.id))} — ${productoNombreEscapado} (${p.cantidad} u.)</strong><br>
            <span class="texto-mudo">Proveedor: ${proveedorNombreEscapado}</span><br>
            <span class="estado-pill estado-${escaparHTML(p.estado)}">${ETIQUETAS_ESTADO[p.estado] || p.estado}</span>
            ${acciones}
        `;
        cont.appendChild(div);
    });

    cont.querySelectorAll('[data-check]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            try {
                await dbCheckOk(parseInt(btn.dataset.check, 10));
                await Promise.all([cargarPedidos(), cargarInventario(), cargarFaltantes()]);
            } catch (err) {
                alert(err.message);
            }
        });
    });
    cont.querySelectorAll('[data-defecto]').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.getElementById('inputReclamoPedidoId').value = btn.dataset.defecto;
            document.getElementById('errorDefecto').innerText = '';
            abrirModal('modalDefecto');
        });
    });
    cont.querySelectorAll('[data-resolver]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const auth = await requiereAutorizacionDueno('Cerrar un reclamo (y sumar stock si corresponde) requiere la contraseña del Dueño.');
            if (!auth) return;
            try {
                const passDueno = typeof auth === 'string' ? auth : null;
                await dbResolverReclamo(parseInt(btn.dataset.resolver, 10), passDueno);
                await Promise.all([cargarPedidos(), cargarInventario(), cargarFaltantes()]);
            } catch (err) {
                alert(err.message);
            }
        });
    });
}

function wireDefectoForm() {
    document.getElementById('formDefecto').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pedidoId = parseInt(document.getElementById('inputReclamoPedidoId').value, 10);
        const detalle = document.getElementById('inputDetalleDefecto').value.trim();
        const resolucion = document.getElementById('selectResolucion').value;
        try {
            await dbReportarDefecto(pedidoId, detalle, resolucion);
            cerrarModales();
            e.target.reset();
            await cargarPedidos();
        } catch (err) {
            document.getElementById('errorDefecto').innerText = err.message;
        }
    });
}

async function cargarFaltantes() {
    const faltantes = await dbListarFaltantes();
    const badge = document.getElementById('contadorFaltantes');
    if (faltantes.length > 0) {
        badge.innerText = faltantes.length;
        badge.classList.remove('oculta');
    } else {
        badge.classList.add('oculta');
    }
    const tbody = document.getElementById('tablaFaltantes');
    tbody.innerHTML = '';
    faltantes.forEach((p) => {
        const tr = document.createElement('tr');
        const nombreEscapado = escaparHTML(p.nombre);
        const proveedorEscapado = escaparHTML(p.proveedor_nombre || '—');
        tr.innerHTML = `<td>${nombreEscapado}</td><td class="stock-critico">${p.stock}</td><td>${proveedorEscapado}</td>`;
        tbody.appendChild(tr);
    });
}

function wireFaltantes() {
    document.getElementById('btnFaltantes').addEventListener('click', async () => {
        await cargarFaltantes();
        abrirModal('modalFaltantes');
    });
}

function wireExportarFaltantes() {
    document.getElementById('btnExportarFaltantes').addEventListener('click', async () => {
        const faltantes = await dbListarFaltantes();
        const encabezado = ['SKU', 'Producto', 'Stock actual', 'Stock minimo', 'Proveedor'];
        const filas = faltantes.map((p) => [p.sku, p.nombre, p.stock, p.stock_minimo, p.proveedor_nombre]);
        const csv = [encabezado, ...filas].map((fila) => fila.map(escaparCSV).join(',')).join('\r\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const fecha = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        a.href = url;
        a.download = `faltantes_${fecha}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

// ---------------------------------------------------------------------
// Lector de Código de Barras (13 Dígitos) y Generación de Pedido/Ticket
// ---------------------------------------------------------------------

function wirePosScanner() {
    const formEscaneo = document.getElementById('formEscaneoPos');
    const inputSku = document.getElementById('inputSkuEscaneo');
    const errorBox = document.getElementById('errorPos');
    const btnVaciar = document.getElementById('btnVaciarCarritoPos');
    const btnGenerarTicket = document.getElementById('btnGenerarTicketPos');

    if (!formEscaneo) return;

    formEscaneo.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.innerText = '';
        const sku = inputSku.value.trim();

        // Validar formato estricto: número entero de 13 dígitos
        if (!/^\d{13}$/.test(sku)) {
            errorBox.innerText = 'El código debe tener exactamente 13 dígitos numéricos (ni más ni menos).';
            inputSku.focus();
            return;
        }

        try {
            const producto = await dbBuscarProductoSku(sku);
            agregarProductoACarritoPos(producto);
            inputSku.value = '';
            inputSku.focus();
        } catch (err) {
            errorBox.innerText = err.message;
        }
    });

    btnVaciar.addEventListener('click', () => {
        carritoPos = [];
        renderCarritoPos();
        errorBox.innerText = '';
        inputSku.focus();
    });

    btnGenerarTicket.addEventListener('click', async () => {
        if (carritoPos.length === 0) return;
        try {
            const itemsPayload = carritoPos.map((i) => ({ producto_id: i.producto.id, cantidad: i.cantidad }));
            const ticket = await dbGenerarPedidoCompra(itemsPayload);
            mostrarModalTicket(ticket);
            carritoPos = [];
            renderCarritoPos();
            // Refrescar inventario (si el Dueño tiene la pestaña visible) y faltantes
            if (obtenerSesion().rol === 'dueno') {
                await Promise.all([cargarInventario(), cargarFaltantes()]);
            }
        } catch (err) {
            alert(err.message);
        }
    });
}

function agregarProductoACarritoPos(producto) {
    const idx = carritoPos.findIndex((item) => item.producto.id === producto.id);
    if (idx >= 0) {
        carritoPos[idx].cantidad += 1;
    } else {
        carritoPos.push({ producto, cantidad: 1 });
    }
    renderCarritoPos();
}

function renderCarritoPos() {
    const tbody = document.getElementById('tablaCarritoPos');
    const totalEl = document.getElementById('totalCarritoPos');
    const btnGenerar = document.getElementById('btnGenerarTicketPos');
    tbody.innerHTML = '';

    if (carritoPos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="texto-mudo" style="text-align:center;">No hay productos cargados todavía. Escaneá o ingresá un código de 13 dígitos.</td></tr>';
        totalEl.innerText = '0.00';
        btnGenerar.disabled = true;
        return;
    }

    let totalGeneral = 0;

    carritoPos.forEach((item, index) => {
        const precio = parseFloat(item.producto.precio || 0);
        const subtotal = precio * item.cantidad;
        totalGeneral += subtotal;

        const tr = document.createElement('tr');
        const skuEscapado = escaparHTML(item.producto.sku);
        const nombreEscapado = escaparHTML(item.producto.nombre);
        tr.innerHTML = `
            <td><code>${skuEscapado}</code></td>
            <td><strong>${nombreEscapado}</strong></td>
            <td>$ ${precio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
            <td style="text-align:center;">
                <button class="cant-btn" onclick="modificarCantidadPos(${index}, -1)" type="button">-</button>
                <span>${item.cantidad}</span>
                <button class="cant-btn" onclick="modificarCantidadPos(${index}, 1)" type="button">+</button>
            </td>
            <td><strong>$ ${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></td>
            <td><button class="btn btn-peligro btn-mini" onclick="eliminarItemPos(${index})" type="button">&times;</button></td>
        `;
        tbody.appendChild(tr);
    });

    totalEl.innerText = totalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    btnGenerar.disabled = false;
}

function modificarCantidadPos(index, delta) {
    if (carritoPos[index]) {
        carritoPos[index].cantidad += delta;
        if (carritoPos[index].cantidad <= 0) {
            carritoPos.splice(index, 1);
        }
        renderCarritoPos();
    }
}

function eliminarItemPos(index) {
    if (carritoPos[index]) {
        carritoPos.splice(index, 1);
        renderCarritoPos();
    }
}

function mostrarModalTicket(ticket) {
    const cont = document.getElementById('contenidoTicketPos');
    let itemsHtml = ticket.items.map((i) => `
        <tr>
            <td style="padding:4px 0;">${escaparHTML(i.nombre)} (${escaparHTML(i.sku)})</td>
            <td style="text-align:center;">x${i.cantidad}</td>
            <td style="text-align:right;">$ ${parseFloat(i.precio_unitario).toFixed(2)}</td>
            <td style="text-align:right; font-weight:bold;">$ ${parseFloat(i.subtotal).toFixed(2)}</td>
        </tr>
    `).join('');

    cont.innerHTML = `
        <div style="text-align:center; margin-bottom:15px;">
            <h2>🏪 POWER KIOSCO</h2>
            <p>COMPROBANTE DE PEDIDO DE COMPRA</p>
            <p>-----------------------------------</p>
            <p>Ticket: <strong>${escaparHTML(ticket.numero_ticket)}</strong></p>
            <p>Fecha: ${escaparHTML(ticket.fecha)}</p>
        </div>
        <table style="width:100%; margin-bottom:15px;">
            <thead>
                <tr style="border-bottom:1px dashed #000;">
                    <th style="text-align:left;">Producto</th>
                    <th style="text-align:center;">Cant</th>
                    <th style="text-align:right;">Precio</th>
                    <th style="text-align:right;">Subtotal</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        <div style="border-top:1px dashed #000; padding-top:10px; text-align:right; font-size:1.2rem; font-weight:bold;">
            TOTAL A PAGAR: $ ${parseFloat(ticket.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </div>
    `;

    abrirModal('modalTicket');
}

// Sondeo periódico: simula el monitoreo constante del stock crítico.
setInterval(() => {
    if (obtenerSesion() && document.getElementById('appPrincipal').style.display !== 'none') {
        cargarFaltantes();
    }
}, 20000);

// ---------------------------------------------------------------------
// Agregar Producto (Solo Dueño)
// ---------------------------------------------------------------------

function wireAgregarProducto() {
    const btnAgregar = document.getElementById('btnAgregarProducto');
    const formAgregar = document.getElementById('formAgregarProducto');
    const inputSku = document.getElementById('inputNuevoSku');
    const errorBox = document.getElementById('errorAgregarProducto');

    if (!btnAgregar) return;
    if (!obtenerSesion().rol === 'dueno') {
        btnAgregar.style.display = 'none';
    }

    btnAgregar.addEventListener('click', async () => {
        if (obtenerSesion().rol !== 'dueno') {
            alert('Solo el Dueño puede agregar productos.');
            return;
        }
        await cargarSelectProveedoresNuevo();
        abrirModal('modalAgregarProducto');
        if (inputSku) inputSku.focus();
    });

    if (formAgregar) {
        formAgregar.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (errorBox) errorBox.innerText = '';

            const sku = inputSku?.value.trim() || '';
            const nombre = document.getElementById('inputNuevoNombre')?.value.trim() || '';
            const precio = parseFloat(document.getElementById('inputNuevoPrecio')?.value || 0);
            const stock = parseInt(document.getElementById('inputNuevoStock')?.value || 0);
            const stockMinimo = parseInt(document.getElementById('inputNuevoStockMinimo')?.value || 5);
            const proveedorId = parseInt(document.getElementById('selectNuevoProveedor')?.value || 0);

            if (!/^\d{13}$/.test(sku)) {
                if (errorBox) errorBox.innerText = 'El SKU debe tener exactamente 13 dígitos numéricos.';
                return;
            }
            if (!nombre || precio < 0 || stock < 0 || stockMinimo < 1) {
                if (errorBox) errorBox.innerText = 'Complete todos los campos correctamente.';
                return;
            }

            try {
                await dbAgregarProducto(sku, nombre, precio, stock, stockMinimo, proveedorId);
                cerrarModales();
                formAgregar.reset();
                await cargarInventario();
                await cargarFaltantes();
            } catch (err) {
                if (errorBox) errorBox.innerText = err.message;
            }
        });
    }
}

async function cargarSelectProveedoresNuevo() {
    const select = document.getElementById('selectNuevoProveedor');
    if (!select) return;
    select.innerHTML = '<option value="">Seleccionar proveedor...</option>';
    try {
        const proveedores = await dbListarProveedores();
        proveedores.forEach((pr) => {
            const opt = document.createElement('option');
            opt.value = pr.id;
            opt.innerText = `${pr.empresa} (${pr.rubro || 'Sin rubro'})`;
            select.appendChild(opt);
        });
    } catch (e) {}
}

function wireBuscarInventario() {
    const input = document.getElementById('inputBuscarProducto');
    if (input) {
        input.addEventListener('input', filtrarInventario);
    }
}

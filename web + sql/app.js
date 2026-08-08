// UI a partir de db.js y maneja login /
// autenticación cruzada con auth.js. No hay ningún fetch() todavía porque
// no hay backend: todo corre en el navegador.

let authModo = null;           // 'switch' | 'accion'
let authResolverPendiente = null;

document.addEventListener('DOMContentLoaded', () => {
    inicializarDatos();
    wireLogin();
    wireHeader();
    wireModales();
    wirePedidoForm();
    wireDefectoForm();
    wireExportarFaltantes();
    wireFaltantes();

    if (sessionStorage.getItem('kiosco_sesion')) {
        mostrarApp();
    } else {
        mostrarLogin();
    }
});

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

    document.getElementById('btnCerrarSesion').addEventListener('click', () => {
        cerrarSesion();
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
            if (authResolverPendiente) { authResolverPendiente(true); authResolverPendiente = null; }
        }
    });
}

/** Devuelve true si la acción está autorizada: directo si la sesión ya es
 *  Dueño, o después de pedir su contraseña (autenticación cruzada) sin
 *  cambiar la cuenta activa del Empleado. Devuelve false si se cancela. */
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
    const tbody = document.getElementById('tablaInventario');
    tbody.innerHTML = '';
    productos.forEach((p) => {
        const proveedor = proveedores.find((pr) => pr.id === p.proveedor_id);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${p.sku}</td>
            <td>${p.nombre}</td>
            <td class="${p.critico ? 'stock-critico' : 'stock-ok'}">${p.stock}${p.critico ? ' (Bajo)' : ''}</td>
            <td>${proveedor ? proveedor.empresa : '—'}</td>
            <td><button class="btn btn-secundario btn-mini" data-editar="${p.id}" data-nombre="${p.nombre}" data-stock="${p.stock}">Editar</button></td>
        `;
        tbody.appendChild(tr);
    });
    tbody.querySelectorAll('[data-editar]').forEach((btn) => {
        btn.addEventListener('click', () => solicitarEdicionStock(parseInt(btn.dataset.editar, 10), btn.dataset.nombre, btn.dataset.stock));
    });

    const select = document.getElementById('selectProductoPedido');
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

    const autorizado = await requiereAutorizacionDueno('El Empleado necesita la contraseña del Dueño para modificar el stock manualmente.');
    if (!autorizado) return;
    try {
        await dbModificarStock(id, parseInt(nuevo, 10));
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
        let acciones = '';
        if (p.estado === 'pendiente') {
            acciones = `
                <div class="acciones">
                    <button class="btn btn-exito btn-mini" data-check="${p.id}">Llegó Bien (Aprobar)</button>
                    <button class="btn btn-peligro btn-mini" data-defecto="${p.id}">Reportar Defecto</button>
                </div>`;
        } else if (p.estado === 'defecto_pendiente') {
            acciones = `
                <div class="acciones">
                    <button class="btn btn-primario btn-mini" data-resolver="${p.id}">Confirmar resolución del proveedor</button>
                </div>
                <p class="texto-mudo">Detalle: ${p.detalle_defecto || ''} — Solicitado: ${p.resolucion_solicitada}</p>`;
        }
        div.innerHTML = `
            <strong>Pedido #${p.id} — ${p.producto_nombre} (${p.cantidad} u.)</strong><br>
            <span class="texto-mudo">Proveedor: ${p.proveedor_nombre}</span><br>
            <span class="estado-pill estado-${p.estado}">${ETIQUETAS_ESTADO[p.estado] || p.estado}</span>
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
            const autorizado = await requiereAutorizacionDueno('Cerrar un reclamo (y sumar stock si corresponde) requiere la contraseña del Dueño.');
            if (!autorizado) return;
            try {
                await dbResolverReclamo(parseInt(btn.dataset.resolver, 10));
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
        tr.innerHTML = `<td>${p.nombre}</td><td class="stock-critico">${p.stock}</td><td>${p.proveedor_nombre}</td>`;
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
        const csv = [encabezado, ...filas].map((fila) => fila.map(escaparCsv).join(',')).join('\r\n');

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

function escaparCsv(valor) {
    const texto = String(valor ?? '');
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

// Sondeo periódico: simula el monitoreo constante del stock crítico.
setInterval(() => {
    if (obtenerSesion() && document.getElementById('appPrincipal').style.display !== 'none') {
        cargarFaltantes();
    }
}, 20000);
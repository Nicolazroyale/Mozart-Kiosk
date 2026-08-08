// auth.js
// -----------------------------------------------------------------------
// Login y control de acceso seguro validado en el servidor PHP.

let sesionCache = null;

async function verificarPasswordDueno(password) {
    if (!password) return false;
    try {
        const res = await api('verificar_dueno', { password });
        return !!res.autorizado;
    } catch (e) {
        return false;
    }
}

function obtenerSesion() {
    return sesionCache || { autenticado: false, rol: null, nombre: null };
}

async function refrescarSesionBackend() {
    try {
        const res = await api('session');
        if (res && res.autenticado) {
            sesionCache = res;
            return res;
        }
    } catch (e) {}
    sesionCache = null;
    return null;
}

/** Login inicial con verificación en el backend */
async function login(rol, password) {
    const res = await api('login', { rol, password });
    sesionCache = res;
    sessionStorage.setItem('kiosco_sesion', JSON.stringify(res));
    return res;
}

async function cambiarRol(destino, password) {
    return login(destino, password);
}

async function cerrarSesion() {
    try {
        await api('logout');
    } catch (e) {}
    sessionStorage.removeItem('kiosco_sesion');
    sesionCache = null;
}

/**
 * Ejecuta una acción restringida a Dueño, pidiendo la contraseña si es necesario
 */
async function ejecutarConAutorizacion(accion, pedirPassword) {
    if (obtenerSesion().rol === 'dueno') {
        return accion();
    }
    const password = await pedirPassword();
    const ok = await verificarPasswordDueno(password);
    if (!ok) throw new Error('Contraseña incorrecta. Acción cancelada.');
    return accion(password);
}

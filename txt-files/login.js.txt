// auth.js
// -----------------------------------------------------------------------
// Login y control de acceso. La contraseña
// del Dueño nunca se guarda en texto plano: se compara su hash SHA-256
// contra el hash guardado en db.js (ver dbObtenerOwnerHash()).

const SESSION_KEY = 'kiosco_sesion';

async function sha256(texto) {
    const datos = new TextEncoder().encode(texto);
    const hashBuffer = await crypto.subtle.digest('SHA-256', datos);
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

async function verificarPasswordDueno(password) {
    if (!password) return false;
    const hashIngresado = await sha256(password);
    return hashIngresado === dbObtenerOwnerHash();
}

function obtenerSesion() {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null')
        || { rol: 'empleado', nombre: 'Empleado' };
}

function guardarSesion(sesion) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sesion));
}

/** Login inicial: elegir con qué cuenta se entra al sistema. */
async function login(rol, password) {
    if (rol === 'dueno') {
        const ok = await verificarPasswordDueno(password);
        if (!ok) throw new Error('Contraseña incorrecta.');
        guardarSesion({ rol: 'dueno', nombre: 'Dueño' });
    } else {
        guardarSesion({ rol: 'empleado', nombre: 'Empleado' });
    }
    return obtenerSesion();
}

async function cambiarRol(destino, password) {
    if (destino === 'empleado') {
        guardarSesion({ rol: 'empleado', nombre: 'Empleado' });
        return obtenerSesion();
    }
    const ok = await verificarPasswordDueno(password);
    if (!ok) throw new Error('Contraseña incorrecta.');
    guardarSesion({ rol: 'dueno', nombre: 'Dueño' });
    return obtenerSesion();
}

function cerrarSesion() {
    sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Ejecuta una accion retringida a Dueño, pidiendo la contraseña si es necesario
 *
 * @param {Function} accion función async a ejecutar una vez autorizada
 * @param {Function} pedirPassword función que muestra el modal de auth y
 *        devuelve una Promise<string> con la contraseña ingresada
 */
async function ejecutarConAutorizacion(accion, pedirPassword) {
    if (obtenerSesion().rol === 'dueno') {
        return accion();
    }
    const password = await pedirPassword();
    const ok = await verificarPasswordDueno(password);
    if (!ok) throw new Error('Contraseña incorrecta. Acción cancelada.');
    return accion();
}
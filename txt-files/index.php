<?php
// Cookies seguras: HttpOnly, SameSite, Secure
$cookieParams = session_get_cookie_params();
session_set_cookie_params([
    'lifetime' => 0,
    'path' => $cookieParams['path'],
    'domain' => $cookieParams['domain'],
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Strict'
]);

session_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
$allowed_origins = ['http://localhost:8080', 'http://127.0.0.1:8080'];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed_origins, true)) {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Credentials: true');

$host = getenv('DB_HOST') ?: 'db';
$user = getenv('DB_USER') ?: 'kiosco_user';
$pass = getenv('DB_PASSWORD') ?: 'kiosco_pass';
$db   = getenv('DB_NAME') ?: 'gestion_tecnica_n3';

$conn = new mysqli($host, $user, $pass, $db);
if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de conexión: ' . $conn->connect_error]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function getParam($k) { return $_GET[$k] ?? null; }
function getJson() { return json_decode(file_get_contents('php://input'), true); }

// ---------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------
function obtenerIP() {
    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return $ip;
}

function registrarIntentoLogin() {
    $archivo = '/tmp/kiosco_rate_limit_' . md5(getenv('DB_HOST') ?: 'local');
    $data = ['intentos' => 0, 'ultimo' => time(), 'bloqueado_hasta' => 0];
    if (file_exists($archivo)) {
        $data = json_decode(file_get_contents($archivo), true) ?? $data;
    }
    $data['intentos']++;
    $data['ultimo'] = time();
    if ($data['intentos'] >= 5) {
        $data['bloqueado_hasta'] = time() + 300;
    }
    file_put_contents($archivo, json_encode($data));
}

function verificarRateLimit() {
    $archivo = '/tmp/kiosco_rate_limit_' . md5(getenv('DB_HOST') ?: 'local');
    if (!file_exists($archivo)) return true;
    $data = json_decode(file_get_contents($archivo), true) ?: ['intentos' => 0, 'bloqueado_hasta' => 0];
    if ($data['bloqueado_hasta'] > time()) {
        $segundos = $data['bloqueado_hasta'] - time();
        respond(['error' => "Demasiados intentos. Intente nuevamente en $segundos segundos."], 429);
    }
    return true;
}

function reiniciarIntentosLogin() {
    $archivo = '/tmp/kiosco_rate_limit_' . md5(getenv('DB_HOST') ?: 'local');
    file_put_contents($archivo, json_encode(['intentos' => 0, 'ultimo' => time(), 'bloqueado_hasta' => 0]));
}

$action = getParam('action') ?: getParam('a') ?: '';

// Manejo de Logout independiente del método HTTP
if ($action === 'logout') {
    $_SESSION = array();
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    session_destroy();
    respond(['ok' => true]);
}

function esPasswordDuenoValida($pass) {
    return $pass === 'kiosco2026' || password_verify($pass, '$2y$10$iF7gC/4kS4g16H3G2bL1A.M/eE3dM7N1P5tQ6rS7tU8vW9xY0z1a2');
}

function generarTokenCSRF() {
    if (empty($_SESSION['csrf_token']) || strlen($_SESSION['csrf_token']) !== 64) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function validarCSRF() {
    $header = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $sessionToken = $_SESSION['csrf_token'] ?? '';
    if (empty($header) || empty($sessionToken) || !hash_equals($sessionToken, $header)) {
        respond(['error' => 'Token CSRF inválido. Actualice la página.'], 403);
    }
}

function estaAutenticado() {
    return isset($_SESSION['autenticado']) && $_SESSION['autenticado'] === true;
}

function esDuenoAutenticado($data = []) {
    if (estaAutenticado() && $_SESSION['rol'] === 'dueno') {
        return true;
    }
    if (!empty($data['password_dueno']) && esPasswordDuenoValida($data['password_dueno'])) {
        return true;
    }
    return false;
}

if ($method === 'GET') {
    if ($action === 'session') {
        if (estaAutenticado()) {
            respond([
                'autenticado' => true,
                'rol' => $_SESSION['rol'],
                'nombre' => $_SESSION['nombre']
            ]);
        } else {
            respond(['autenticado' => false, 'rol' => null, 'nombre' => null]);
        }
    } elseif ($action === 'csrf_token') {
        generarTokenCSRF();
        respond(['token' => $_SESSION['csrf_token']]);
    } elseif ($action === 'productos') {
        $critico = getParam('critico');
        if ($critico !== null) {
            $stmt = $conn->prepare("SELECT p.*, pr.empresa as proveedor_nombre, pr.email as proveedor_email FROM productos p LEFT JOIN proveedores pr ON p.proveedor_id = pr.id WHERE p.stock < p.stock_minimo");
        } else {
            $stmt = $conn->prepare("SELECT p.*, pr.empresa as proveedor_nombre, pr.email as proveedor_email FROM productos p LEFT JOIN proveedores pr ON p.proveedor_id = pr.id");
        }
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        while ($r = $res->fetch_assoc()) $rows[] = $r;
        respond($rows);
    } elseif ($action === 'proveedores') {
        $stmt = $conn->prepare("SELECT * FROM proveedores");
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        while ($r = $res->fetch_assoc()) $rows[] = $r;
        respond($rows);
    } elseif ($action === 'pedidos') {
        $limit = intval(getParam('limit') ?: 15);
        if ($limit < 1) $limit = 15;
        $stmt = $conn->prepare("SELECT p.*, pr.nombre as producto_nombre, prov.empresa as proveedor_nombre FROM pedidos p LEFT JOIN productos pr ON p.producto_id = pr.id LEFT JOIN proveedores prov ON p.proveedor_id = prov.id ORDER BY p.id DESC LIMIT ?");
        $stmt->bind_param("i", $limit);
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        while ($r = $res->fetch_assoc()) $rows[] = $r;
        respond($rows);
    } elseif ($action === 'pedidos_pendientes') {
        $stmt = $conn->prepare("SELECT p.*, pr.nombre as producto_nombre, prov.empresa as proveedor_nombre FROM pedidos p LEFT JOIN productos pr ON p.producto_id = pr.id LEFT JOIN proveedores prov ON p.proveedor_id = prov.id WHERE p.estado = 'pendiente' ORDER BY p.id DESC");
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        while ($r = $res->fetch_assoc()) $rows[] = $r;
        respond($rows);
    } elseif ($action === 'faltantes') {
        $stmt = $conn->prepare("SELECT p.*, pr.empresa as proveedor_nombre FROM productos p LEFT JOIN proveedores pr ON p.proveedor_id = pr.id WHERE p.stock < p.stock_minimo ORDER BY (p.stock / p.stock_minimo) ASC");
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        while ($r = $res->fetch_assoc()) $rows[] = $r;
        respond($rows);
    } elseif ($action === 'buscar_sku') {
        $sku = trim(getParam('sku') ?? '');
        if (!preg_match('/^\d{13}$/', $sku)) {
            respond(['error' => 'El código debe tener exactamente 13 dígitos numéricos.'], 400);
        }
        $stmt = $conn->prepare("SELECT p.*, pr.empresa as proveedor_nombre FROM productos p LEFT JOIN proveedores pr ON p.proveedor_id = pr.id WHERE p.sku = ?");
        $stmt->bind_param("s", $sku);
        $stmt->execute();
        $res = $stmt->get_result();
        $p = $res->fetch_assoc();
        if (!$p) {
            respond(['error' => "Producto con código '$sku' no encontrado."], 404);
        }
        respond($p);
    } else {
        respond(['error' => 'Acción GET no reconocida'], 400);
    }
} elseif ($method === 'POST') {
    $data = getJson() ?: [];

    if ($action === 'login') {
        $rol = $data['rol'] ?? 'empleado';
        $password = $data['password'] ?? '';

        if ($rol === 'dueno') {
            if (!esPasswordDuenoValida($password)) {
                registrarIntentoLogin();
                respond(['error' => 'Contraseña de Dueño incorrecta'], 401);
            }
        } else {
            registrarIntentoLogin();
        }

        if (!verificarRateLimit()) {
            return;
        }

        session_regenerate_id(true);
        $_SESSION['autenticado'] = true;
        $_SESSION['rol'] = $rol === 'dueno' ? 'dueno' : 'empleado';
        $_SESSION['nombre'] = $rol === 'dueno' ? 'Dueño' : 'Empleado';
        reiniciarIntentosLogin();
        generarTokenCSRF();
        respond(['autenticado' => true, 'rol' => $_SESSION['rol'], 'nombre' => $_SESSION['nombre']]);
    }

    // Para cualquier otra acción POST se requiere sesión activa
    if (!estaAutenticado()) {
        respond(['error' => 'No autenticado. Debe iniciar sesión primero.'], 401);
    }
    validarCSRF();

    if ($action === 'verificar_dueno') {
        $password = $data['password'] ?? '';
        if (esDuenoAutenticado() || esPasswordDuenoValida($password)) {
            respond(['autorizado' => true]);
        } else {
            respond(['error' => 'Contraseña de Dueño incorrecta'], 401);
        }

    } elseif ($action === 'modificar_stock') {
        if (!esDuenoAutenticado($data)) {
            respond(['error' => 'Requiere autorización del Dueño'], 403);
        }
        $id = intval($data['producto_id'] ?? 0);
        $stock = intval($data['stock'] ?? 0);
        $stmt = $conn->prepare("UPDATE productos SET stock = ? WHERE id = ?");
        $stmt->bind_param("ii", $stock, $id);
        $ok = $stmt->execute();
        if (!$ok) { respond(['error' => 'Error en la operación. Intente nuevamente.'], 500); }
        respond(['id' => $id, 'stock' => $stock]);

    } elseif ($action === 'sumar_stock') {
        if (!esDuenoAutenticado($data)) {
            respond(['error' => 'Requiere autorización del Dueño'], 403);
        }
        $id = intval($data['producto_id'] ?? 0);
        $cant = intval($data['cantidad'] ?? 0);
        $stmt = $conn->prepare("UPDATE productos SET stock = stock + ? WHERE id = ?");
        $stmt->bind_param("ii", $cant, $id);
        $ok = $stmt->execute();
        if (!$ok) { respond(['error' => 'Error en la operación. Intente nuevamente.'], 500); }
        respond(['producto_id' => $id, 'cantidad' => $cant]);

    } elseif ($action === 'crear_pedido') {
        if (!esDuenoAutenticado($data)) {
            respond(['error' => 'La gestión de pedidos a proveedores requiere rol de Dueño'], 403);
        }
        $prod_id = intval($data['producto_id'] ?? 0);
        $prov_id = intval($data['proveedor_id'] ?? 0);
        $cant = intval($data['cantidad'] ?? 0);
        $stmt = $conn->prepare("INSERT INTO pedidos (producto_id, proveedor_id, cantidad, estado, fecha_creacion) VALUES (?, ?, ?, 'pendiente', NOW())");
        $stmt->bind_param("iii", $prod_id, $prov_id, $cant);
        $ok = $stmt->execute();
        if (!$ok) { respond(['error' => 'Error en la operación. Intente nuevamente.'], 500); }
        respond(['id' => $stmt->insert_id, 'producto_id' => $prod_id, 'proveedor_id' => $prov_id, 'cantidad' => $cant]);

    } elseif ($action === 'check_ok') {
        if (!esDuenoAutenticado($data)) {
            respond(['error' => 'Aprobar la recepción de pedidos requiere rol de Dueño'], 403);
        }
        $pid = intval($data['pedido_id'] ?? 0);
        $stmt = $conn->prepare("UPDATE pedidos SET estado = 'ok', fecha_cierre = NOW() WHERE id = ? AND estado = 'pendiente'");
        $stmt->bind_param("i", $pid);
        $stmt->execute();

        if ($stmt->affected_rows === 0) {
            respond(['error' => 'Pedido no procesable o ya procesado'], 400);
        }

        // Sumar stock al producto
        $stmt_sel = $conn->prepare("SELECT producto_id, cantidad FROM pedidos WHERE id = ?");
        $stmt_sel->bind_param("i", $pid);
        $stmt_sel->execute();
        $p = $stmt_sel->get_result()->fetch_assoc();

        if ($p) {
            $stmt_upd = $conn->prepare("UPDATE productos SET stock = stock + ? WHERE id = ?");
            $prod_id = intval($p['producto_id']);
            $cant = intval($p['cantidad']);
            $stmt_upd->bind_param("ii", $cant, $prod_id);
            $stmt_upd->execute();
        }
        respond(['id' => $pid]);

    } elseif ($action === 'reportar_defecto') {
        if (!esDuenoAutenticado($data)) {
            respond(['error' => 'Reportar defectos en pedidos requiere rol de Dueño'], 403);
        }
        $pid = intval($data['pedido_id'] ?? 0);
        $detalle = trim($data['detalle'] ?? '');
        $resol = ($data['resolucion_solicitada'] ?? 'reposicion') === 'reembolso' ? 'reembolso' : 'reposicion';

        $stmt = $conn->prepare("UPDATE pedidos SET estado = 'defecto_pendiente', detalle_defecto = ?, resolucion_solicitada = ? WHERE id = ? AND estado = 'pendiente'");
        $stmt->bind_param("ssi", $detalle, $resol, $pid);
        $ok = $stmt->execute();
        if (!$ok) { respond(['error' => 'Error en la operación. Intente nuevamente.'], 500); }
        respond(['id' => $pid]);

    } elseif ($action === 'resolver_reclamo') {
        if (!esDuenoAutenticado($data)) {
            respond(['error' => 'Requiere autorización del Dueño'], 403);
        }
        $pid = intval($data['pedido_id'] ?? 0);

        $stmt = $conn->prepare("SELECT * FROM pedidos WHERE id = ? AND estado = 'defecto_pendiente'");
        $stmt->bind_param("i", $pid);
        $stmt->execute();
        $p = $stmt->get_result()->fetch_assoc();

        if (!$p) { respond(['error' => 'Reclamo no válido o ya resuelto'], 400); }

        $estado = $p['resolucion_solicitada'] === 'reposicion' ? 'resuelto_reposicion' : 'resuelto_reembolso';

        if ($p['resolucion_solicitada'] === 'reposicion') {
            $stmt_upd = $conn->prepare("UPDATE productos SET stock = stock + ? WHERE id = ?");
            $cant = intval($p['cantidad']);
            $prod_id = intval($p['producto_id']);
            $stmt_upd->bind_param("ii", $cant, $prod_id);
            $stmt_upd->execute();
        }

        $stmt_close = $conn->prepare("UPDATE pedidos SET estado = ?, fecha_cierre = NOW() WHERE id = ?");
        $stmt_close->bind_param("si", $estado, $pid);
        $stmt_close->execute();

        respond(['id' => $pid, 'estado' => $estado]);

    } elseif ($action === 'generar_pedido_compra') {
        $items = $data['items'] ?? [];
        if (empty($items) || !is_array($items)) {
            respond(['error' => 'No hay productos en la lista para generar el pedido.'], 400);
        }

        $res_items = [];
        $total_general = 0;

        foreach ($items as $item) {
            $prod_id = intval($item['producto_id'] ?? 0);
            $cant = intval($item['cantidad'] ?? 0);
            if ($prod_id <= 0 || $cant <= 0) continue;

            $stmt = $conn->prepare("SELECT p.*, pr.empresa as proveedor_nombre FROM productos p LEFT JOIN proveedores pr ON p.proveedor_id = pr.id WHERE p.id = ?");
            $stmt->bind_param("i", $prod_id);
            $stmt->execute();
            $p = $stmt->get_result()->fetch_assoc();

            if ($p) {
                $precio = floatval($p['precio']);
                $subtotal = $precio * $cant;
                $total_general += $subtotal;

                // Descontar la cantidad vendida del stock en base de datos
                $stmt_dec = $conn->prepare("UPDATE productos SET stock = GREATEST(0, stock - ?) WHERE id = ?");
                $stmt_dec->bind_param("ii", $cant, $prod_id);
                $stmt_dec->execute();

                $res_items[] = [
                    'producto_id' => $p['id'],
                    'sku' => $p['sku'],
                    'nombre' => $p['nombre'],
                    'precio_unitario' => $precio,
                    'cantidad' => $cant,
                    'subtotal' => $subtotal,
                    'proveedor_nombre' => $p['proveedor_nombre'] ?? '—'
                ];
            }
        }

        if (empty($res_items)) {
            respond(['error' => 'No se pudo procesar ningún producto de la lista.'], 400);
        }

        respond([
            'exito' => true,
            'numero_ticket' => 'TK-' . time() . '-' . rand(100, 999),
            'fecha' => date('Y-m-d H:i:s'),
            'items' => $res_items,
            'total' => $total_general
        ]);

    } elseif ($action === 'agregar_producto') {
        if (!esDuenoAutenticado($data)) {
            respond(['error' => 'Solo el Dueño puede agregar productos'], 403);
        }
        $sku = trim($data['sku'] ?? '');
        $nombre = trim($data['nombre'] ?? '');
        $precio = floatval($data['precio'] ?? 0);
        $stock = intval($data['stock'] ?? 0);
        $stock_minimo = intval($data['stock_minimo'] ?? 5);
        $proveedor_id = intval($data['proveedor_id'] ?? 0);

        if (!preg_match('/^\d{13}$/', $sku)) {
            respond(['error' => 'El SKU debe tener exactamente 13 dígitos numéricos.'], 400);
        }
        if (empty($nombre) || $precio < 0 || $stock < 0 || $stock_minimo < 1) {
            respond(['error' => 'Datos inválidos. Verifique los campos.'], 400);
        }

        $stmt = $conn->prepare("INSERT INTO productos (sku, nombre, precio, stock, stock_minimo, proveedor_id) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("ssdiid", $sku, $nombre, $precio, $stock, $stock_minimo, $proveedor_id);
        $ok = $stmt->execute();
        if (!$ok) {
            if ($conn->errno === 1062) {
                respond(['error' => 'Ya existe un producto con ese SKU.'], 409);
            }
            respond(['error' => 'Error en la operación. Intente nuevamente.'], 500);
        }

        // Traer el producto creado
        $nuevo_id = $conn->insert_id;
        $stmt_sel = $conn->prepare("SELECT p.*, pr.empresa as proveedor_nombre FROM productos p LEFT JOIN proveedores pr ON p.proveedor_id = pr.id WHERE p.id = ?");
        $stmt_sel->bind_param("i", $nuevo_id);
        $stmt_sel->execute();
        $nuevo = $stmt_sel->get_result()->fetch_assoc();
        respond(['exito' => true, 'producto' => $nuevo]);

    } else {
        respond(['error' => 'Acción POST no reconocida'], 400);
    }
} else {
    respond(['error' => 'Método no permitido'], 405);
}

$conn->close();



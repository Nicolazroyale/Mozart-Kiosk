-- Crear la base de datos
CREATE DATABASE IF NOT EXISTS gestion_tecnica_n3;
USE gestion_tecnica_n3;

-- Tabla de Roles (del proyecto original)
CREATE TABLE roles (
  id_rol INT AUTO_INCREMENT PRIMARY KEY,
  nombre_rol VARCHAR(50) NOT NULL UNIQUE,
  nivel_acceso INT NOT NULL
);

-- Tabla de Usuarios del Sistema (del proyecto original)
CREATE TABLE usuarios (
  id_usuario INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  id_rol INT NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (id_rol) REFERENCES roles(id_rol) ON DELETE RESTRICT
);

-- Tabla de Proveedores (necesaria para el kiosco)
CREATE TABLE proveedores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa VARCHAR(150) NOT NULL,
  rubro VARCHAR(100),
  contacto VARCHAR(150),
  email VARCHAR(150),
  telefono VARCHAR(50)
);

-- Tabla de Productos (necesaria para el kiosco)
CREATE TABLE productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(13) UNIQUE NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  precio DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  stock INT DEFAULT 0,
  stock_minimo INT DEFAULT 5,
  proveedor_id INT,
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE SET NULL
);

-- Tabla de Pedidos (necesaria para el kiosco)
CREATE TABLE pedidos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  proveedor_id INT NOT NULL,
  cantidad INT NOT NULL,
  estado VARCHAR(30) DEFAULT 'pendiente',
  detalle_defecto TEXT,
  resolucion_solicitada VARCHAR(30),
  fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre DATETIME NULL,
  FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
  FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE CASCADE
);

-- Datos base: roles
INSERT INTO roles (nombre_rol, nivel_acceso) VALUES
('Director', 1),
('Secretaría', 2),
('Preceptor', 3),
('Dueño', 1),
('Empleado', 3);

-- Datos base: usuarios (Contraseña Dueño: kiosco2026)
INSERT INTO usuarios (nombre, apellido, email, password_hash, id_rol, activo) VALUES
('Admin', 'Dueño', 'admin@kiosco.com', '$2y$10$iF7gC/4kS4g16H3G2bL1A.M/eE3dM7N1P5tQ6rS7tU8vW9xY0z1a2', 4, TRUE),
('Empleado', 'Kiosco', 'empleado@kiosco.com', '$2y$10$iF7gC/4kS4g16H3G2bL1A.M/eE3dM7N1P5tQ6rS7tU8vW9xY0z1a2', 5, TRUE);

-- Datos base: proveedores
INSERT INTO proveedores (empresa, rubro, contacto, email, telefono) VALUES
('Distribuidora Gaseosas SRL', 'Gaseosas', 'Juan Pérez', 'juan.perez@gaseosas.com', '11-1234-5678'),
('Cervecería Nacional', 'Alcohol', 'María Gómez', 'ventas@cervezanacional.com', '11-9876-5432'),
('Mayorista Dulces del Sur', 'Golosinas', 'Carla Ruiz', 'pedidos@dulcesdelsur.com', '11-5555-2020'),
('Lácteos La Serrana', 'Lácteos', 'Pedro Sosa', 'contacto@laserrana.com', '11-4444-1010');

-- Datos base: productos (SKU de 13 dígitos numéricos EAN-13)
INSERT INTO productos (sku, nombre, precio, stock, stock_minimo, proveedor_id) VALUES
('7791234567890', 'Coca-Cola 2L', 1500.00, 24, 10, 1),
('7791234567891', 'Alfajor Triple', 600.00, 12, 8, 3),
('7791234567892', 'Cerveza Quilmes 1L', 2200.00, 30, 6, 2),
('7791234567893', 'Leche Entera 1L', 950.00, 18, 6, 4),
('7791234567894', 'Agua Mineral 1.5L', 800.00, 50, 8, 1);

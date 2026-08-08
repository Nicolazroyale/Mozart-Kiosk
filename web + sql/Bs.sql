-- Crear la base de datos
CREATE DATABASE IF NOT EXISTS gestion_tecnica_n3;
USE gestion_tecnica_n3;

-- Tabla de Roles (Director, Vicedirector, Secretaria, Preceptor)
CREATE TABLE roles (
    id_rol INT AUTO_INCREMENT PRIMARY KEY,
    nombre_rol VARCHAR(50) NOT NULL UNIQUE,
    nivel_acceso INT NOT NULL -- 1: Maximo (Director), 2: Secretaria, 3: Preceptor
);

-- Tabla de Usuarios del Sistema
CREATE TABLE usuarios (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Se guarda la contraseña encriptada, NUNCA en texto plano
    id_rol INT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (id_rol) REFERENCES roles(id_rol) ON DELETE RESTRICT
);

-- Insertar roles base
INSERT INTO roles (nombre_rol, nivel_acceso) VALUES 
('Director', 1),
('Secretaría', 2),
('Preceptor', 3);

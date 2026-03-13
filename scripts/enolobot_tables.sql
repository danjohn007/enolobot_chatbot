-- Enolobot Database Schema
-- Tablas necesarias para el funcionamiento de los flujos de Enolobot

-- ===================================================================
-- 1. Tabla de vinos disponibles para compra
-- ===================================================================
CREATE TABLE IF NOT EXISTS wines (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    details TEXT NULL COMMENT 'Detalles adicionales del vino (para qué ocasión, notas de cata, etc.)',
    suggested_for VARCHAR(255) NULL COMMENT 'Ocasiones sugeridas para este vino',
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    image_path VARCHAR(500) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_active (is_active),
    INDEX idx_display_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- 2. Tabla de compras de vinos (drafts y confirmados)
-- ===================================================================
CREATE TABLE IF NOT EXISTS wine_purchases (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    phone VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255) NULL,
    wine_id BIGINT UNSIGNED NULL,
    quantity INT NOT NULL DEFAULT 1,
    email VARCHAR(255) NULL,
    step VARCHAR(50) NULL COMMENT 'Paso actual del flujo: awaiting_name, showing_wines, wine_selected, awaiting_email',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft, confirmed, cancelled',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_phone (phone),
    INDEX idx_status (status),
    INDEX idx_wine_id (wine_id),
    FOREIGN KEY (wine_id) REFERENCES wines(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- 3. Tabla de reservaciones de viñedo (restaurante/lounge)
-- ===================================================================
CREATE TABLE IF NOT EXISTS vineyard_reservations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    phone VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255) NULL,
    party_size INT NULL,
    reservation_date DATE NULL,
    space_type VARCHAR(50) NULL COMMENT 'Restaurante, Zona Lounge',
    email VARCHAR(255) NULL,
    step VARCHAR(50) NULL COMMENT 'awaiting_name, awaiting_party_size, awaiting_date, awaiting_space, awaiting_email',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft, confirmed, cancelled',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_phone (phone),
    INDEX idx_status (status),
    INDEX idx_reservation_date (reservation_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- 4. Tabla de solicitudes de contacto con administración
-- ===================================================================
CREATE TABLE IF NOT EXISTS contact_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    phone VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255) NULL,
    department VARCHAR(100) NULL COMMENT 'Facturación, Gerencia, Servicio al Cliente, Seguridad, Tienda',
    step VARCHAR(50) NULL COMMENT 'awaiting_name, awaiting_department',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft, completed',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_phone (phone),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- 5. Tabla de solicitudes de información sobre eventos privados
-- ===================================================================
CREATE TABLE IF NOT EXISTS private_event_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    phone VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255) NULL,
    step VARCHAR(50) NULL COMMENT 'awaiting_name',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft, completed',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_phone (phone),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- 6. Tabla de eventos de cata y vendimia disponibles
-- ===================================================================
CREATE TABLE IF NOT EXISTS wine_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    event_date DATE NOT NULL,
    event_time TIME NULL,
    price_per_person DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    max_capacity INT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_event_date (event_date),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- 7. Tabla de reservaciones para eventos de cata y vendimia
-- ===================================================================
CREATE TABLE IF NOT EXISTS wine_event_reservations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    phone VARCHAR(50) NOT NULL,
    customer_name VARCHAR(255) NULL,
    event_id BIGINT UNSIGNED NULL,
    party_size INT NULL,
    total_amount DECIMAL(10,2) NULL,
    payment_method VARCHAR(50) NULL COMMENT 'Pago en línea, Transferencia',
    email VARCHAR(255) NULL,
    step VARCHAR(50) NULL COMMENT 'awaiting_name, showing_events, awaiting_party_size, awaiting_payment_method, awaiting_email',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT 'draft, confirmed, cancelled',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_phone (phone),
    INDEX idx_status (status),
    INDEX idx_event_id (event_id),
    FOREIGN KEY (event_id) REFERENCES wine_events(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================================================
-- DATOS DE EJEMPLO (opcional - puedes modificar o eliminar)
-- ===================================================================

-- Vinos de ejemplo
INSERT INTO wines (name, description, details, suggested_for, price, is_active, display_order) VALUES
('Vino Tinto Reserva 2020', 'Vino tinto con cuerpo, criado en barrica de roble', 'Notas de cereza, vainilla y especias. 14% alcohol.', 'Cenas formales, carnes rojas, quesos maduros', 350.00, 1, 1),
('Vino Blanco Sauvignon 2021', 'Vino blanco fresco y afrutado', 'Aromas cítricos con toques herbáceos. Ideal para pescados.', 'Aperitivos, mariscos, ensaladas', 280.00, 1, 2),
('Vino Rosado 2022', 'Rosado ligero y refrescante', 'Sabor a fresas y frambuesas. Perfecto para tardes soleadas.', 'Picnics, celebraciones, platillos ligeros', 250.00, 1, 3),
('Vino Espumoso Brut', 'Espumoso elegante método tradicional', 'Burbujas finas, notas de manzana verde y pan tostado.', 'Celebraciones, brindis, postres', 420.00, 1, 4);

-- Eventos de cata de ejemplo
INSERT INTO wine_events (name, description, event_date, event_time, price_per_person, max_capacity, is_active) VALUES
('Cata de Vinos Tintos', 'Descubre los secretos de nuestros mejores vinos tintos con maridaje incluido', '2026-04-15', '18:00:00', 450.00, 20, 1),
('Vendimia Primavera 2026', 'Participa en la cosecha de uvas y elaboración de vino artesanal', '2026-05-20', '09:00:00', 850.00, 15, 1),
('Cata y Maridaje Gourmet', 'Experiencia completa de cata con menú de 5 tiempos del chef', '2026-04-25', '19:30:00', 1200.00, 12, 1),
('Tour del Viñedo', 'Recorrido guiado por el viñedo con degustación de 3 vinos', '2026-04-10', '11:00:00', 350.00, 25, 1);

-- ===================================================================
-- NOTAS IMPORTANTES:
-- ===================================================================
-- 1. Ejecuta este script en tu base de datos MySQL antes de usar Enolobot
-- 2. Asegúrate de que la base de datos tenga el charset utf8mb4 configurado
-- 3. Los datos de ejemplo pueden ser modificados según tus necesidades
-- 4. Las relaciones FOREIGN KEY requieren que InnoDB esté habilitado
-- 5. Los números de contacto en contact.flow.js deben ser actualizados
--    con los números reales de tu viñedo (archivo: contact.flow.js línea 11-17)

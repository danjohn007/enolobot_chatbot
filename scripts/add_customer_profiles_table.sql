-- ============================================================================
-- Script para agregar tabla de perfiles de clientes
-- Almacena información básica de contactos no registrados para el chatbot
-- ============================================================================

-- Crear tabla de perfiles de clientes
CREATE TABLE IF NOT EXISTS `customer_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `phone` VARCHAR(20) NOT NULL COMMENT 'Teléfono normalizado en formato +52XXXXXXXXXX',
  `customer_name` VARCHAR(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Nombre completo del cliente',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_phone` (`phone`),
  KEY `idx_phone_lookup` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Perfiles básicos de clientes/contactos del chatbot identificados por teléfono';

-- Índice para búsquedas rápidas por teléfono
ALTER TABLE `customer_profiles` 
  ADD INDEX `idx_created_at` (`created_at`);

-- ============================================================================
-- Instrucciones de uso:
-- 1. Conectarse a la base de datos del sistema
-- 2. Ejecutar este script completo
-- ============================================================================

-- Mensaje de confirmación
SELECT 'Tabla customer_profiles creada correctamente' AS status;

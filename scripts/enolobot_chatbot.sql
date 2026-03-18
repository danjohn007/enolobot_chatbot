-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: localhost:3306
-- Tiempo de generación: 13-03-2026 a las 14:53:01
-- Versión del servidor: 5.7.23-23
-- Versión de PHP: 8.1.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `enolobot_chatbot`
--

DELIMITER $$
--
-- Procedimientos
--
CREATE DEFINER=`enolobot`@`localhost` PROCEDURE `check_resource_availability` (IN `p_resource_type` VARCHAR(20), IN `p_resource_id` INT, IN `p_check_in` DATE, IN `p_check_out` DATE)   BEGIN
    DECLARE conflicts INT DEFAULT 0;
    
    IF p_resource_type = 'room' THEN
        -- Verificar reservaciones de habitaciones
        SELECT COUNT(*) INTO conflicts
        FROM room_reservations
        WHERE room_id = p_resource_id
          AND status IN ('confirmed', 'checked_in')
          AND (
              (check_in_date <= p_check_in AND check_out_date > p_check_in)
              OR (check_in_date < p_check_out AND check_out_date >= p_check_out)
              OR (check_in_date >= p_check_in AND check_out_date <= p_check_out)
          );
    ELSEIF p_resource_type = 'table' THEN
        -- Verificar reservaciones de mesas (ventana de 2 horas)
        SELECT COUNT(*) INTO conflicts
        FROM table_reservations
        WHERE table_id = p_resource_id
          AND status IN ('confirmed', 'seated')
          AND reservation_date = p_check_in
          AND ABS(TIMESTAMPDIFF(MINUTE, reservation_time, TIME(p_check_out))) < 120;
    ELSEIF p_resource_type = 'amenity' THEN
        -- Verificar reservaciones de amenidades (ventana de 2 horas)
        SELECT COUNT(*) INTO conflicts
        FROM amenity_reservations
        WHERE amenity_id = p_resource_id
          AND status IN ('confirmed', 'in_use')
          AND reservation_date = p_check_in
          AND ABS(TIMESTAMPDIFF(MINUTE, reservation_time, TIME(p_check_out))) < 120;
    END IF;
    
    -- Retornar 0 si disponible, 1 si hay conflictos
    SELECT IF(conflicts > 0, 0, 1) as is_available;
END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `activity_log`
--

CREATE TABLE `activity_log` (
  `id` bigint(20) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `hotel_id` int(11) DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` int(11) DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `data` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `activity_log`
--

INSERT INTO `activity_log` (`id`, `user_id`, `hotel_id`, `action`, `entity_type`, `entity_id`, `description`, `ip_address`, `user_agent`, `data`, `created_at`) VALUES
(1, NULL, NULL, 'database_migration', NULL, NULL, 'Migración v1.0.0 a v1.1.0+ completada exitosamente', NULL, NULL, NULL, '2025-10-04 19:05:16'),
(2, 7, NULL, 'system_setup', 'system', NULL, 'Configuración inicial del sistema: Superadmin creado, planes de suscripción configurados, configuraciones globales establecidas', '127.0.0.1', NULL, NULL, '2025-10-04 19:59:09'),
(3, NULL, NULL, 'system_update', NULL, NULL, 'Comprehensive system updates installed: Password Reset, Loyalty Program, Global Settings, Payment Transactions', NULL, NULL, NULL, '2025-10-04 21:47:58'),
(4, NULL, NULL, 'system_update', NULL, NULL, 'Comprehensive system updates installed: Password Reset, Loyalty Program, Global Settings, Payment Transactions', NULL, NULL, NULL, '2025-10-04 21:52:47'),
(5, NULL, NULL, 'database_migration', NULL, NULL, 'Tabla bank_accounts creada, payment_transactions actualizada (columnas, índice, clave foránea) y precios de suscripciones sincronizados', NULL, NULL, NULL, '2025-10-05 03:53:33');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `amenities`
--

CREATE TABLE `amenities` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('wellness','fitness','entertainment','transport','business','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(10,2) DEFAULT '0.00',
  `capacity` int(11) DEFAULT NULL,
  `opening_time` time DEFAULT NULL,
  `closing_time` time DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_available` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `allow_overlap` tinyint(1) DEFAULT '1' COMMENT 'Permitir empalmar con mismo horario y fecha',
  `max_reservations` int(11) DEFAULT NULL COMMENT 'Capacidad máxima de reservaciones cuando allow_overlap=0',
  `block_duration_hours` decimal(4,2) DEFAULT '2.00' COMMENT 'Horas de bloqueo por reservación'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `amenities`
--

INSERT INTO `amenities` (`id`, `hotel_id`, `name`, `category`, `price`, `capacity`, `opening_time`, `closing_time`, `description`, `is_available`, `created_at`, `updated_at`, `allow_overlap`, `max_reservations`, `block_duration_hours`) VALUES
(1, 1, 'Spa & Wellness Center', 'wellness', 500.00, 10, '09:00:00', '20:00:00', 'Centro de spa con masajes, tratamientos faciales y corporales', 1, '2025-10-04 18:02:35', '2025-10-04 18:02:35', 1, NULL, 2.00),
(2, 1, 'Gimnasio', 'fitness', 0.00, 20, '06:00:00', '22:00:00', 'Gimnasio equipado con máquinas de cardio y pesas', 1, '2025-10-04 18:02:35', '2025-10-04 18:02:35', 1, NULL, 2.00),
(3, 1, 'Piscina', 'entertainment', 0.00, 50, '07:00:00', '21:00:00', 'Piscina al aire libre con área de camastros', 1, '2025-10-04 18:02:35', '2025-10-04 18:02:35', 1, NULL, 2.00),
(4, 1, 'Sauna', 'wellness', 200.00, 8, '10:00:00', '20:00:00', 'Sauna finlandés con ducha fría', 1, '2025-10-04 18:02:35', '2025-10-04 18:02:35', 1, NULL, 2.00),
(5, 1, 'Salón de Juegos', 'entertainment', 0.00, 15, '10:00:00', '23:00:00', 'Mesa de billar, futbolito y juegos de mesa', 1, '2025-10-04 18:02:35', '2025-10-04 18:02:35', 1, NULL, 2.00),
(6, 1, 'Servicio de Transporte', 'transport', 300.00, 4, '00:00:00', '23:59:59', 'Transporte privado al aeropuerto o tours', 1, '2025-10-04 18:02:35', '2025-10-04 18:02:35', 1, NULL, 2.00),
(7, 1, 'Sala de Negocios', 'business', 150.00, 12, '08:00:00', '18:00:00', 'Sala con proyector, pizarra y WiFi de alta velocidad', 1, '2025-10-04 18:02:35', '2025-10-04 18:02:35', 1, NULL, 2.00),
(8, 1, 'Yoga en la Playa', 'wellness', 250.00, 15, '07:00:00', '08:00:00', 'Clase de yoga matutina frente al mar', 0, '2025-10-04 18:02:35', '2025-10-05 04:11:08', 1, NULL, 2.00),
(9, 5, 'Pesca', 'entertainment', 100.00, 6, '08:00:00', '18:00:00', '', 1, '2025-10-04 23:34:48', '2025-10-04 23:34:48', 1, NULL, 2.00),
(10, 7, 'Pesca', 'entertainment', 1000.00, 4, '07:00:00', '18:00:00', 'Paseo por el lago con truchas', 1, '2025-10-05 17:25:24', '2025-10-05 17:25:24', 1, NULL, 2.00),
(11, 7, 'Pesca', 'entertainment', 1000.00, 4, '07:00:00', '18:00:00', 'Paseo por el lago con truchas', 1, '2025-10-05 17:26:12', '2025-10-05 17:26:12', 1, NULL, 2.00),
(12, 7, 'Pesca', 'entertainment', 1000.00, 4, '07:00:00', '18:00:00', 'Paseo por el lago con truchas', 1, '2025-10-05 17:27:15', '2025-10-05 17:27:15', 1, NULL, 2.00),
(13, 7, 'Caballerizas', 'entertainment', 1800.00, 1, '10:00:00', '17:00:00', 'Paseo en caballo', 1, '2025-10-05 17:28:07', '2025-10-05 17:28:07', 1, NULL, 2.00),
(14, 8, 'Pesca', 'entertainment', 1000.00, 4, '07:00:00', '17:00:00', 'Pesca en lancha', 1, '2025-10-05 20:31:08', '2025-10-05 20:31:28', 1, NULL, 2.00),
(15, 8, 'Parrillada Familiar', 'entertainment', 2500.00, 8, '14:00:00', '18:00:00', 'Asadito con corte de carne', 1, '2025-10-05 21:52:23', '2025-10-05 21:52:23', 1, NULL, 2.00),
(16, 8, 'Caballerizas', 'entertainment', 1000.00, 1, '10:00:00', '18:00:00', 'Sesión de fotos', 1, '2025-10-05 23:53:36', '2025-10-05 23:53:36', 1, NULL, 2.00),
(18, 6, 'Monta de Caballo', 'entertainment', 150.00, 1, '10:00:00', '18:00:00', '150 la hora sino eres cliente.', 1, '2025-10-06 00:41:12', '2025-10-06 00:41:12', 1, NULL, 2.00),
(21, 6, 'Temazcal', 'entertainment', 300.00, 1, '11:00:00', '00:00:00', 'Sesión de 4 puertas con Ritual de Sanación', 1, '2025-10-10 02:54:05', '2025-10-10 02:54:05', 1, NULL, 2.00),
(22, 6, 'Cuatrimoto', 'entertainment', 400.00, 2, '10:00:00', '18:00:00', 'Capacidad hasta para 3 personas', 1, '2025-10-10 03:00:22', '2025-10-12 14:43:19', 1, NULL, 2.00),
(23, 6, 'Pesca', 'entertainment', 0.00, 1, '10:00:00', '18:00:00', 'La actividad de pesca no tiene costo, solo se cobra lo que se pesca.', 1, '2025-10-10 19:35:13', '2025-10-10 19:35:13', 0, 4, 2.00);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `amenity_reservations`
--

CREATE TABLE `amenity_reservations` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `amenity_id` int(11) NOT NULL,
  `guest_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `guest_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `guest_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` int(11) DEFAULT NULL COMMENT 'If reserved by logged-in user',
  `reservation_date` date NOT NULL,
  `reservation_time` time NOT NULL,
  `duration` int(11) DEFAULT '60' COMMENT 'Duration in minutes',
  `party_size` int(11) DEFAULT '1',
  `status` enum('pending','confirmed','in_use','completed','cancelled','no_show') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `special_requests` text COLLATE utf8mb4_unicode_ci,
  `confirmation_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notification_sent` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `guest_birthday` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stores reservations for hotel amenities (gym, pool, spa, etc)';

--
-- Volcado de datos para la tabla `amenity_reservations`
--

INSERT INTO `amenity_reservations` (`id`, `hotel_id`, `amenity_id`, `guest_name`, `guest_email`, `guest_phone`, `user_id`, `reservation_date`, `reservation_time`, `duration`, `party_size`, `status`, `notes`, `special_requests`, `confirmation_code`, `notification_sent`, `created_at`, `updated_at`, `guest_birthday`) VALUES
(4, 7, 13, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', NULL, '2025-10-05', '10:00:00', 60, 1, 'confirmed', '', NULL, 'AMN-20251005-6112', 0, '2025-10-05 20:12:37', '2025-10-07 00:35:00', NULL),
(5, 8, 14, 'Dan Raso', 'eva@impactosdigitales.com', '4425986318', NULL, '2025-10-05', '10:00:00', 60, 1, 'confirmed', '', NULL, 'AMN-20251005-0140', 0, '2025-10-05 20:34:11', '2025-10-05 21:43:51', NULL),
(6, 8, 14, 'Jonathan Raso', 'facturacion@impactosdigitales.com', '4424865389', 18, '2025-10-12', '15:00:00', 60, 1, 'pending', 'VISITA. ', NULL, 'AMN-20251005-7222', 0, '2025-10-05 21:41:51', '2025-10-05 21:41:51', NULL),
(7, 8, 14, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', 6, '2025-10-05', '16:00:00', 60, 1, 'pending', 'Habitación: 3. ', NULL, 'AMN-20251005-2966', 0, '2025-10-05 21:42:15', '2025-10-05 21:42:15', NULL),
(8, 8, 14, 'Sanchez Jimenez', 'san@id.com', '9720973129', 20, '2025-10-05', '08:00:00', 60, 1, 'pending', 'VISITA. ', NULL, 'AMN-20251005-4266', 0, '2025-10-05 21:48:37', '2025-10-05 21:48:37', NULL),
(9, 8, 15, 'Luisa Hae', 'luisa@id.com', '2183629869', 21, '2025-10-05', '15:00:00', 60, 1, 'confirmed', 'Habitación: 2. ', NULL, 'AMN-20251005-6656', 0, '2025-10-05 21:54:25', '2025-10-05 22:05:05', NULL),
(10, 8, 15, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', 6, '2025-10-08', '15:00:00', 60, 1, 'pending', 'VISITA. ', NULL, 'AMN-20251005-8156', 0, '2025-10-05 22:43:56', '2025-10-05 22:43:56', NULL),
(11, 6, 18, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', 6, '2025-10-26', '13:00:00', 60, 1, 'cancelled', 'Habitación: 3. ', NULL, 'AMN-20251005-3673', 0, '2025-10-06 00:42:52', '2025-10-06 02:54:01', NULL),
(16, 6, 18, 'Dan Raso', 'oscarbarry16@gmail.com', '4424865390', 27, '2025-10-19', '12:00:00', 60, 1, 'pending', 'Habitación: 1. ', NULL, 'AMN-20251006-2480', 0, '2025-10-06 06:41:29', '2025-10-06 06:41:29', NULL),
(17, 6, 18, 'Miguel Cervantes', 'tecnologia@idindustrial.com.mx', '4425986318', 6, '2025-10-05', '15:56:00', 60, 1, 'confirmed', 'Habitación: 1. ', NULL, 'AMN-20251006-9090', 0, '2025-10-06 16:33:51', '2025-10-06 17:39:58', NULL),
(19, 6, 23, 'Roberto Ejemplo', 'roberto@example.com', '+52 4427869806', 5, '2099-01-01', '00:00:00', 120, 1, '', '{\"step\":\"schedule\",\"amenityId\":23,\"amenityName\":\"Pesca\",\"category\":\"entertainment\",\"price\":0,\"capacity\":1,\"opening_time\":\"10:00:00\",\"closing_time\":\"18:00:00\",\"allow_overlap\":0}', NULL, 'AMN-20251010-4047', 0, '2025-10-10 20:58:42', '2025-10-10 20:58:47', NULL),
(20, 6, 21, 'Roberto Ejemplo', 'roberto@example.com', '+52 4427869806', 5, '2099-01-01', '00:00:00', 120, 1, '', '{\"step\":\"date\",\"amenityId\":21,\"amenityName\":\"Temazcal\",\"category\":\"entertainment\",\"price\":300,\"capacity\":1,\"opening_time\":\"11:00:00\",\"closing_time\":\"00:00:00\",\"allow_overlap\":1,\"waiting\":\"date\"}', NULL, 'AMN-20251010-5596', 0, '2025-10-10 21:37:12', '2025-10-10 21:37:17', NULL),
(21, 6, 22, 'Roberto Ejemplo', 'roberto@example.com', '+52 4427869806', 5, '2099-01-01', '00:00:00', 120, 1, '', '{\"step\":\"date\",\"amenityId\":22,\"amenityName\":\"cuatrimoto\",\"category\":\"entertainment\",\"price\":400,\"capacity\":2,\"opening_time\":\"10:00:00\",\"closing_time\":\"18:00:00\",\"allow_overlap\":1,\"waiting\":\"date\"}', NULL, 'AMN-20251010-8671', 0, '2025-10-10 21:38:08', '2025-10-10 21:38:11', NULL),
(22, 6, 22, 'Andres Raso Perez', 'andyperez@id.com', '2831698927', 33, '2025-10-19', '12:30:00', 60, 1, 'pending', '', NULL, 'AMN-20251013-0884', 0, '2025-10-13 21:05:18', '2025-10-13 21:05:18', NULL);

--
-- Disparadores `amenity_reservations`
--
DELIMITER $$
CREATE TRIGGER `trg_amenity_reservation_confirmation` BEFORE INSERT ON `amenity_reservations` FOR EACH ROW BEGIN
    IF NEW.confirmation_code IS NULL OR NEW.confirmation_code = '' THEN
        SET NEW.confirmation_code = CONCAT('AMN-', DATE_FORMAT(NOW(), '%Y%m%d'), '-', LPAD(FLOOR(RAND() * 10000), 4, '0'));
    END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_amenity_reservation_notification` AFTER INSERT ON `amenity_reservations` FOR EACH ROW BEGIN
    DECLARE v_amenity_name VARCHAR(255);
    
    -- Get amenity name
  SELECT name INTO v_amenity_name
  FROM amenities
  WHERE id = NEW.amenity_id;
    
  -- Insert notifications for users with amenity permissions
  -- First, notify admin and managers (they have access to all)
  INSERT INTO system_notifications (
    hotel_id,
    user_id,
    notification_type,
    related_type,
    related_id,
    title,
    message,
    priority,
    requires_sound
  )
  SELECT 
    NEW.hotel_id,
    u.id,
    'amenity_request',
    'amenity_reservation',
    NEW.id,
    'Nueva Reservación de Amenidad',
    CONCAT('Reservación de ', COALESCE(v_amenity_name, 'amenidad'), ' para ', NEW.guest_name, 
         ' el ', DATE_FORMAT(NEW.reservation_date, '%d/%m/%Y'), 
         ' a las ', TIME_FORMAT(NEW.reservation_time, '%H:%i')),
    'high',
    1
  FROM users u
  WHERE u.hotel_id = NEW.hotel_id
    AND u.role IN ('admin', 'manager')
    AND u.is_active = 1;
    
  -- Then notify collaborators with specific amenity access
  INSERT INTO system_notifications (
    hotel_id,
    user_id,
    notification_type,
    related_type,
    related_id,
    title,
    message,
    priority,
    requires_sound
  )
  SELECT 
    NEW.hotel_id,
    rp.user_id,
    'amenity_request',
    'amenity_reservation',
    NEW.id,
    'Nueva Reservación de Amenidad',
    CONCAT('Reservación de ', COALESCE(v_amenity_name, 'amenidad'), ' para ', NEW.guest_name, 
         ' el ', DATE_FORMAT(NEW.reservation_date, '%d/%m/%Y'), 
         ' a las ', TIME_FORMAT(NEW.reservation_time, '%H:%i')),
    'high',
    1
  FROM role_permissions rp
  INNER JOIN users u ON rp.user_id = u.id
  WHERE rp.hotel_id = NEW.hotel_id
    AND u.is_active = 1
    AND u.role = 'collaborator'
    AND (
      rp.amenity_ids = 'all'
      OR rp.amenity_ids IS NULL
      OR rp.amenity_ids LIKE CONCAT('%', NEW.amenity_id, '%')
    );
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_block_amenity_on_confirm` AFTER UPDATE ON `amenity_reservations` FOR EACH ROW BEGIN
    -- If status changed to confirmed, create a 2-hour block
    IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
        -- Calculate end time (2 hours after reservation time)
        SET @end_time = ADDTIME(NEW.reservation_time, '02:00:00');
        
        -- Insert block record if not already exists
        INSERT IGNORE INTO resource_blocks (
            resource_type,
            resource_id,
            blocked_by,
            reason,
            start_date,
            end_date,
            status
        ) VALUES (
            'amenity',
            NEW.amenity_id,
            COALESCE(NEW.user_id, 1), -- Use user_id or system user
            CONCAT('Reservación confirmada - ', NEW.guest_name),
            TIMESTAMP(NEW.reservation_date, NEW.reservation_time),
            TIMESTAMP(NEW.reservation_date, @end_time),
            'active'
        );
    END IF;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `availability_calendar`
--

CREATE TABLE `availability_calendar` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `resource_type` enum('room','table') COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_id` int(11) NOT NULL,
  `date` date NOT NULL,
  `is_available` tinyint(1) DEFAULT '1',
  `available_slots` int(11) DEFAULT '0',
  `total_slots` int(11) DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `bank_accounts`
--

CREATE TABLE `bank_accounts` (
  `id` int(11) NOT NULL,
  `bank_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_holder` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `account_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `clabe` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'CLABE interbancaria (México)',
  `swift` varchar(11) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Código SWIFT/BIC para transferencias internacionales',
  `account_type` enum('checking','savings','other') COLLATE utf8mb4_unicode_ci DEFAULT 'checking',
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT 'MXN',
  `is_active` tinyint(1) DEFAULT '1',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Cuentas bancarias para recibir pagos de suscripciones y servicios';

--
-- Volcado de datos para la tabla `bank_accounts`
--

INSERT INTO `bank_accounts` (`id`, `bank_name`, `account_holder`, `account_number`, `clabe`, `swift`, `account_type`, `currency`, `is_active`, `notes`, `created_at`, `updated_at`) VALUES
(1, 'Banco Por Configurar', 'Nombre del Titular', 'XXXXXXXXXXXXX', NULL, NULL, 'checking', 'MXN', 1, 'Configure las cuentas bancarias desde el panel de Superadmin o actualice esta entrada con información real', '2025-10-05 03:38:02', '2025-10-05 03:38:02');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `cart_items`
--

CREATE TABLE `cart_items` (
  `id` int(11) NOT NULL,
  `cart_id` int(11) NOT NULL,
  `dish_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL DEFAULT '1',
  `unit_price` decimal(10,2) NOT NULL,
  `special_instructions` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `chatbot_reservations`
--

CREATE TABLE `chatbot_reservations` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `resource_type` enum('room','table','amenity') COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_id` int(11) NOT NULL,
  `guest_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `guest_email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `guest_phone` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `check_in_date` date NOT NULL,
  `check_out_date` date DEFAULT NULL,
  `reservation_date` datetime DEFAULT NULL COMMENT 'For tables and amenities',
  `reservation_time` time DEFAULT NULL COMMENT 'For tables and amenities',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','confirmed','cancelled','expired') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `released_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stores public chatbot reservations with automatic expiration';

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `discount_codes`
--

CREATE TABLE `discount_codes` (
  `id` int(11) NOT NULL,
  `code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `discount_type` enum('percentage','fixed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'percentage',
  `amount` decimal(10,2) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `active` tinyint(1) DEFAULT '1',
  `valid_from` date NOT NULL,
  `valid_to` date NOT NULL,
  `usage_limit` int(11) DEFAULT NULL COMMENT 'NULL = ilimitado',
  `times_used` int(11) DEFAULT '0',
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `discount_codes`
--

INSERT INTO `discount_codes` (`id`, `code`, `discount_type`, `amount`, `hotel_id`, `active`, `valid_from`, `valid_to`, `usage_limit`, `times_used`, `description`, `created_at`, `updated_at`) VALUES
(1, 'WELCOME10', 'percentage', 10.00, 1, 1, '2025-10-12', '2025-11-11', NULL, 0, 'Código de bienvenida - 10% de descuento', '2025-10-12 22:19:21', '2025-10-12 22:19:21'),
(2, 'PROMO50', 'fixed', 50.00, 1, 1, '2025-10-12', '2025-12-11', 100, 0, 'Promoción especial - $50 de descuento', '2025-10-12 22:19:21', '2025-10-12 22:19:21'),
(3, 'FLASH20', 'percentage', 20.00, 1, 1, '2025-10-12', '2025-10-19', 50, 0, 'Flash Sale - 20% de descuento', '2025-10-12 22:19:21', '2025-10-12 22:19:21');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `discount_code_usages`
--

CREATE TABLE `discount_code_usages` (
  `id` int(11) NOT NULL,
  `discount_code_id` int(11) NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_type` enum('room','table','amenity') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'room',
  `discount_amount` decimal(10,2) NOT NULL,
  `original_price` decimal(10,2) NOT NULL,
  `final_price` decimal(10,2) NOT NULL,
  `used_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `dishes`
--

CREATE TABLE `dishes` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` enum('appetizer','main_course','dessert','beverage','breakfast','lunch','dinner') COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `service_time` enum('breakfast','lunch','dinner','all_day') COLLATE utf8mb4_unicode_ci DEFAULT 'all_day',
  `is_available` tinyint(1) DEFAULT '1',
  `image_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `dishes`
--

INSERT INTO `dishes` (`id`, `hotel_id`, `name`, `category`, `price`, `description`, `service_time`, `is_available`, `image_url`, `created_at`, `updated_at`) VALUES
(1, 1, 'Huevos Rancheros', 'breakfast', 120.00, 'Huevos con salsa ranchera, frijoles y tortillas', 'breakfast', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(2, 1, 'Omelette del Chef', 'breakfast', 150.00, 'Omelette con jamón, queso y vegetales', 'breakfast', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(3, 1, 'Pancakes', 'breakfast', 100.00, 'Hot cakes con miel de maple y frutas', 'breakfast', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(4, 1, 'Ensalada César', 'appetizer', 180.00, 'Lechuga romana, crutones, parmesano y aderezo César', 'all_day', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(5, 1, 'Sopa de Tortilla', 'appetizer', 90.00, 'Sopa tradicional con tiras de tortilla y aguacate', 'all_day', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(6, 1, 'Filete Mignon', 'main_course', 450.00, 'Filete de res con papas y vegetales', 'dinner', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(7, 1, 'Salmón a la Parrilla', 'main_course', 380.00, 'Salmón fresco con arroz y ensalada', 'lunch', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(8, 1, 'Tacos de Pescado', 'main_course', 220.00, 'Tres tacos de pescado empanizado con salsa especial', 'lunch', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(9, 1, 'Pasta Alfredo', 'main_course', 280.00, 'Fettuccine con salsa Alfredo y pollo', 'all_day', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(10, 1, 'Tiramisu', 'dessert', 120.00, 'Postre italiano tradicional', 'all_day', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(11, 1, 'Cheesecake', 'dessert', 130.00, 'Pastel de queso con frutos rojos', 'all_day', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(12, 1, 'Flan Napolitano', 'dessert', 80.00, 'Flan casero estilo mexicano', 'all_day', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(13, 1, 'Margarita Clásica', 'beverage', 150.00, 'Margarita con tequila premium', 'all_day', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(14, 1, 'Piña Colada', 'beverage', 130.00, 'Bebida tropical con ron y piña', 'all_day', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(15, 1, 'Agua Fresca', 'beverage', 50.00, 'Agua de frutas natural', 'all_day', 1, NULL, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(16, 5, 'Huevos Divorciados', 'breakfast', 180.00, 'Huevos Divorciados', 'breakfast', 1, NULL, '2025-10-04 23:33:46', '2025-10-04 23:33:46'),
(17, 8, 'Huevos Divorciados', 'breakfast', 180.00, 'Salsa roja y verde', 'breakfast', 1, NULL, '2025-10-05 20:22:32', '2025-10-05 20:22:32');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `email_notifications`
--

CREATE TABLE `email_notifications` (
  `id` int(11) NOT NULL,
  `recipient_email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `notification_type` enum('reservation_confirmation','reservation_reminder','order_confirmation','payment_receipt','service_request','general') COLLATE utf8mb4_unicode_ci NOT NULL,
  `related_type` enum('room_reservation','table_reservation','order','service_request','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_id` int(11) DEFAULT NULL,
  `status` enum('pending','sent','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `sent_at` timestamp NULL DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `export_queue`
--

CREATE TABLE `export_queue` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `hotel_id` int(11) DEFAULT NULL,
  `export_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `export_format` enum('pdf','excel','csv') COLLATE utf8mb4_unicode_ci NOT NULL,
  `parameters` json DEFAULT NULL,
  `status` enum('queued','processing','completed','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'queued',
  `file_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` int(11) DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `download_count` int(11) DEFAULT '0',
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `global_settings`
--

CREATE TABLE `global_settings` (
  `id` int(11) NOT NULL,
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` text COLLATE utf8mb4_unicode_ci,
  `setting_type` enum('string','number','boolean','json') COLLATE utf8mb4_unicode_ci DEFAULT 'string',
  `description` text COLLATE utf8mb4_unicode_ci,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'general',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `global_settings`
--

INSERT INTO `global_settings` (`id`, `setting_key`, `setting_value`, `setting_type`, `description`, `category`, `updated_at`, `updated_by`, `created_at`) VALUES
(1, 'trial_period_days', '20', 'number', 'Días de prueba gratuita para nuevos registros', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(2, 'trial_auto_activate', '1', 'boolean', 'Activar automáticamente periodo de prueba en registro', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(3, 'default_subscription_plan', '1', 'number', 'ID del plan de suscripción por defecto (Trial)', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(4, 'require_hotel_name_registration', '1', 'boolean', 'Requerir nombre del hotel en registro público', 'registration', '2025-10-04 19:59:09', NULL, '2025-10-05 13:48:05'),
(5, 'public_registration_role', 'admin', 'string', 'Rol asignado en registro público (admin para propietarios)', 'registration', '2025-10-04 19:59:09', NULL, '2025-10-05 13:48:05'),
(6, 'payment_gateway_stripe_enabled', '1', 'boolean', 'Habilitar Stripe como pasarela de pago', 'payment', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(7, 'payment_gateway_paypal_enabled', '1', 'boolean', 'Habilitar PayPal como pasarela de pago', 'payment', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(8, 'payment_gateway_mercadopago_enabled', '1', 'boolean', 'Habilitar MercadoPago como pasarela de pago', 'payment', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(9, 'subscription_block_on_expire', '1', 'boolean', 'Bloquear acceso al vencer suscripción', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(10, 'subscription_notification_days_before', '7', 'number', 'Días antes de vencimiento para enviar notificación', 'notification', '2025-10-04 19:59:09', NULL, '2025-10-05 13:48:05'),
(11, 'subscription_auto_renew_default', '1', 'boolean', 'Activar renovación automática por defecto', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(12, 'invoice_auto_generate', '1', 'boolean', 'Generar facturas automáticamente', 'billing', '2025-10-04 19:59:09', NULL, '2025-10-05 13:48:05'),
(13, 'system_currency_default', 'MXN', 'string', 'Moneda por defecto del sistema', 'general', '2025-10-04 19:59:09', NULL, '2025-10-05 13:48:05'),
(14, 'system_timezone_default', 'America/Mexico_City', 'string', 'Zona horaria por defecto', 'general', '2025-10-04 19:59:09', NULL, '2025-10-05 13:48:05'),
(15, 'superadmin_email', 'superadmin@mayorbot.com', 'string', 'Email del superadministrador principal', 'system', '2025-10-04 19:59:09', NULL, '2025-10-05 13:48:05'),
(16, 'paypal_enabled', '1', 'boolean', 'Habilitar pagos con PayPal', 'payment', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(17, 'paypal_client_id', '', 'string', 'PayPal Client ID', 'payment', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(18, 'paypal_secret', '', 'string', 'PayPal Secret Key', 'payment', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(19, 'paypal_mode', 'sandbox', 'string', 'PayPal Mode (sandbox/live)', 'payment', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(20, 'smtp_enabled', '0', 'boolean', 'Habilitar envío de emails', 'email', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(21, 'smtp_host', 'smtp.gmail.com', 'string', 'Servidor SMTP', 'email', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(22, 'smtp_port', '587', 'number', 'Puerto SMTP', 'email', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(23, 'smtp_username', 'superadmin@mayorbot.com', 'string', 'Usuario SMTP', 'email', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(24, 'smtp_password', 'Danjohn007', 'string', 'Contraseña SMTP', 'email', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(25, 'smtp_from_email', '', 'string', 'Email remitente del sistema', 'email', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(26, 'smtp_from_name', 'MajorBot', 'string', 'Nombre remitente del sistema', 'email', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(27, 'loyalty_enabled', '1', 'boolean', 'Habilitar programa de lealtad', 'loyalty', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(28, 'loyalty_default_percentage', '10', 'number', 'Porcentaje por defecto de comisión (%)', 'loyalty', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(29, 'loyalty_min_withdrawal', '500', 'number', 'Monto mínimo para retiro', 'loyalty', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(30, 'currency_symbol', '$', 'string', 'Símbolo de la moneda', 'financial', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(31, 'currency_code', 'MXN', 'string', 'Código de la moneda', 'financial', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(32, 'tax_rate', '16', 'number', 'Porcentaje de tasa de impuesto (%)', 'financial', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(33, 'tax_enabled', '1', 'boolean', 'Aplicar impuestos', 'financial', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(34, 'site_name', 'MajorBot', 'string', 'Nombre del Sitio Público', 'site', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(35, 'site_logo', '', 'string', 'URL del Logo del Sitio', 'site', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(36, 'site_description', 'Sistema de Mayordomía Online', 'string', 'Descripción del Sitio', 'site', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(37, 'site_url', 'www.majorbot.digital', 'string', 'URL del sitio web', 'site', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(38, 'trial_days', '30', 'number', 'Días del Periodo Gratuito', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(39, 'plan_monthly_price', '6999', 'number', 'Precio del plan mensual', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(40, 'plan_annual_price', '69990', 'number', 'Precio del plan anual', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(41, 'promo_enabled', '0', 'boolean', 'Activar precios promocionales', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(42, 'promo_monthly_price', '5599', 'number', 'Precio promocional mensual', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(43, 'promo_annual_price', '5990', 'number', 'Precio promocional anual', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(44, 'promo_start_date', '', 'string', 'Fecha inicio promoción', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(45, 'promo_end_date', '', 'string', 'Fecha fin promoción', 'subscription', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(46, 'whatsapp_enabled', '0', 'boolean', 'Habilitar chatbot de WhatsApp', 'whatsapp', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(47, 'whatsapp_number', '', 'string', 'Número de WhatsApp del sistema', 'whatsapp', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(48, 'whatsapp_api_key', '', 'string', 'API Key de WhatsApp Business', 'whatsapp', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(49, 'bank_accounts', 'Nombre: Dan Jonathan Raso Ríos Banco: STP Clabe: 728969000060096192', 'json', 'Datos de cuentas bancarias para depósitos', 'payment', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(152, 'bank_accounts_info', 'DATOS BANCARIOS:\r\nBanco SANTANDER\r\nCuenta 65-51122374-4\r\nBeneficiario DAN JONATHAN RASO RÍOS\r\nClave interbancaria (18 dígitos): 014680655112237441\r\n', 'string', 'Información de Cuentas Bancarias para Depósitos', 'payment', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(153, 'terms_and_conditions', 'Términos y Condiciones de Uso – MayorBot\r\nÚltima actualización: Octubre 2025\r\nBienvenido a MayorBot, una plataforma digital desarrollada para la gestión de mayordomía, reservaciones, habitaciones, mesas de restaurante, amenidades y servicios de atención al huésped en hoteles y entidades de alojamiento.\r\nAl registrarte, acceder o utilizar los servicios de MayorBot, aceptas expresamente estos Términos y Condiciones de Uso y nuestra Política de Privacidad. Si no estás de acuerdo con alguna de las disposiciones, deberás abstenerte de utilizar el sistema.\r\n\r\n1. Definiciones\r\nPara los efectos de estos Términos y Condiciones se entenderá por:\r\n* MayorBot: Sistema web y/o aplicación móvil propiedad de la empresa desarrolladora, que permite la gestión digital de servicios de mayordomía, reservas y administración hotelera.\r\n* Usuario: Toda persona física o moral que accede, se registra o utiliza el sistema.\r\n* Administrador del Hotel: Usuario responsable de la gestión interna del hotel dentro del sistema.\r\n* Colaborador: Personal operativo o administrativo asignado a roles específicos dentro del hotel.\r\n* Superadministrador: Usuario con privilegios globales para supervisar y administrar los hoteles registrados.\r\n* Suscripción: Contrato digital mediante el cual el usuario obtiene acceso al sistema bajo un esquema de pago mensual, anual o periodo de prueba.\r\n* Amenidades: Instalaciones o servicios que el hotel ofrece y que pueden ser reservados o gestionados dentro de MayorBot.\r\n\r\n2. Objeto del Sistema\r\nMayorBot tiene como finalidad ofrecer una herramienta tecnológica integral que permita:\r\n* Gestionar habitaciones, mesas de restaurante y amenidades.\r\n* Administrar reservaciones y bloqueos de disponibilidad.\r\n* Controlar solicitudes de mayordomía o servicios al huésped.\r\n* Facilitar la comunicación interna entre administradores y colaboradores.\r\n* Gestionar suscripciones, pagos y periodos de prueba de los hoteles registrados.\r\n\r\n3. Registro y Acceso\r\n* El registro es obligatorio para acceder a las funciones administrativas del sistema.\r\n* Cada hotel o entidad deberá designar a un Administrador responsable de su cuenta.\r\n* Los usuarios deberán proporcionar información veraz, actualizada y completa.\r\n* El acceso se realiza mediante credenciales personales e intransferibles (correo y contraseña).\r\n* MayorBot no se hace responsable por el uso indebido de credenciales o accesos compartidos.\r\n\r\n4. Planes de Suscripción y Periodo de Prueba\r\n* MayorBot ofrece planes mensuales, anuales y un periodo de prueba gratuito cuyo tiempo puede variar según la configuración vigente.\r\n* El usuario podrá acceder libremente durante el periodo de prueba, con todas las funcionalidades habilitadas.\r\n* Una vez finalizado dicho periodo, será necesario activar una suscripción de pago para continuar utilizando el sistema.\r\n* La falta de pago o renovación ocasionará la suspensión temporal del acceso hasta regularizar el estado de cuenta.\r\n* Los pagos realizados no son reembolsables, salvo error imputable a la plataforma.\r\n\r\n5. Obligaciones de los Usuarios\r\nLos usuarios se comprometen a:\r\n* Hacer uso del sistema únicamente para fines lícitos y dentro de las políticas del hotel.\r\n* No alterar, descompilar o manipular el código fuente o estructura del sistema.\r\n* No utilizar MayorBot para almacenar o distribuir información falsa, ofensiva o ilegal.\r\n* Mantener la confidencialidad de la información interna del hotel y sus huéspedes.\r\n* Respetar los límites de acceso de acuerdo con su rol asignado (admin, colaborador, etc.).\r\n\r\n6. Uso de Funcionalidades\r\n* El Administrador del Hotel podrá dar de alta habitaciones, mesas, amenidades, platillos y colaboradores.\r\n* El Gerente de Restaurante podrá administrar el catálogo de alimentos y la disponibilidad del comedor.\r\n* El Hostess tendrá la facultad de aplicar bloqueos manuales de disponibilidad (habitaciones, mesas, amenidades).\r\n* Los Colaboradores podrán recibir notificaciones y actualizar el estado de solicitudes según su rol.\r\n* El Superadministrador podrá supervisar el uso general del sistema y realizar auditorías internas.\r\n\r\n7. Notificaciones y Comunicaciones\r\nMayorBot podrá enviar notificaciones al usuario por medio de correo electrónico, mensajes push o alertas en la plataforma sobre:\r\n* Confirmaciones o cancelaciones de reservaciones.\r\n* Recordatorios de vencimiento de suscripción.\r\n* Actualizaciones del sistema o cambios en los Términos y Condiciones.\r\nEl usuario acepta recibir dichas notificaciones como parte del uso normal de la plataforma.\r\n\r\n8. Privacidad y Protección de Datos\r\nMayorBot recopila y utiliza información personal conforme a su Política de Privacidad, cumpliendo con las leyes aplicables en materia de protección de datos personales.La información del hotel, huéspedes y colaboradores será tratada con estricta confidencialidad y únicamente para fines operativos del sistema.\r\n\r\n9. Suspensión o Cancelación de Cuentas\r\nMayorBot se reserva el derecho de suspender o cancelar cuentas de usuarios en caso de:\r\n* Incumplimiento de estos Términos y Condiciones.\r\n* Actividad sospechosa, ilícita o que comprometa la seguridad del sistema.\r\n* Uso del sistema fuera de los propósitos establecidos.\r\nEn caso de cancelación por incumplimiento, no procederán reembolsos de los pagos efectuados.\r\n\r\n10. Propiedad Intelectual\r\n* Todos los derechos de propiedad intelectual e industrial de MayorBot, su nombre, logotipo, código fuente, diseño, base de datos y contenido pertenecen a la empresa desarrolladora.\r\n* Queda estrictamente prohibida la reproducción, copia, venta o distribución parcial o total del sistema sin autorización expresa por escrito.\r\n\r\n11. Limitación de Responsabilidad\r\nMayorBot no será responsable por:\r\n* Pérdidas económicas o de datos causadas por mal uso del sistema.\r\n* Errores derivados de información incorrecta ingresada por los usuarios.\r\n* Fallos temporales del servicio debidos a mantenimiento o causas de fuerza mayor.\r\n* La administración interna de los hoteles, su personal o sus huéspedes.\r\nEl sistema se proporciona “tal cual”, sin garantías adicionales implícitas o explícitas.\r\n\r\n12. Modificaciones\r\nMayorBot podrá modificar estos Términos y Condiciones en cualquier momento. Las modificaciones serán notificadas a los usuarios y entrarán en vigor desde su publicación en el portal oficial.\r\nEl uso continuado del sistema tras dichas modificaciones implica la aceptación de los nuevos términos.\r\n\r\n13. Jurisdicción y Legislación Aplicable\r\nEstos Términos y Condiciones se rigen por las leyes aplicables en los Estados Unidos Mexicanos.Cualquier controversia derivada del uso del sistema será sometida a los tribunales competentes de la ciudad donde se encuentre la sede principal de la empresa desarrolladora.\r\n\r\n14. Contacto\r\nPara consultas, soporte o solicitudes relacionadas con estos Términos y Condiciones, comunícate a:Correo: soporte@mayorbot.comSitio web: www.mayorbot.com\r\n', 'string', 'Términos y Condiciones del Sistema', 'legal', '2025-11-30 21:16:46', 7, '2025-10-05 13:48:05'),
(154, 'plan_trial_days', '30', 'string', 'Días de prueba gratuita', 'subscriptions', '2025-10-05 13:49:01', NULL, '2025-10-05 13:49:01');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `global_statistics`
--

CREATE TABLE `global_statistics` (
  `id` int(11) NOT NULL,
  `stat_date` date NOT NULL,
  `stat_type` enum('daily','weekly','monthly','yearly') COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_hotels` int(11) DEFAULT '0',
  `active_hotels` int(11) DEFAULT '0',
  `total_rooms` int(11) DEFAULT '0',
  `occupied_rooms` int(11) DEFAULT '0',
  `total_tables` int(11) DEFAULT '0',
  `occupied_tables` int(11) DEFAULT '0',
  `total_reservations` int(11) DEFAULT '0',
  `total_orders` int(11) DEFAULT '0',
  `total_revenue` decimal(12,2) DEFAULT '0.00',
  `total_users` int(11) DEFAULT '0',
  `active_subscriptions` int(11) DEFAULT '0',
  `data` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `hotels`
--

CREATE TABLE `hotels` (
  `id` int(11) NOT NULL,
  `owner_id` int(11) DEFAULT NULL,
  `subscription_plan_id` int(11) DEFAULT NULL,
  `subscription_status` enum('trial','active','suspended','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'trial',
  `subscription_start_date` date DEFAULT NULL,
  `subscription_end_date` date DEFAULT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `max_rooms` int(11) DEFAULT '50',
  `max_tables` int(11) DEFAULT '30',
  `max_staff` int(11) DEFAULT '20',
  `features` json DEFAULT NULL,
  `timezone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'America/Mexico_City',
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT 'MXN',
  `logo_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `website` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `hotels`
--

INSERT INTO `hotels` (`id`, `owner_id`, `subscription_plan_id`, `subscription_status`, `subscription_start_date`, `subscription_end_date`, `name`, `address`, `phone`, `email`, `description`, `max_rooms`, `max_tables`, `max_staff`, `features`, `timezone`, `currency`, `logo_url`, `website`, `is_active`, `created_at`, `updated_at`) VALUES
(1, NULL, NULL, 'trial', NULL, NULL, 'Hotel Paradise', 'Av. Principal 123, Cancún, Q.R.', '+52 998 123 4567', 'info@hotelparadise.com', 'Hotel de lujo con vista al mar, servicios de primera clase', 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(2, 8, NULL, 'active', '2025-10-04', '2026-10-04', 'Domun Hotel', NULL, NULL, 'nath@domunhotel.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-04 20:08:52', '2025-10-04 20:08:52'),
(3, 9, NULL, 'active', '2025-10-04', '2025-11-03', 'Hotel Qro', NULL, NULL, 'belendiaz@mayorbot.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-04 22:11:47', '2025-10-04 22:11:48'),
(4, 10, NULL, 'active', '2025-10-04', '2026-10-04', 'Hotel Santiago', NULL, NULL, 'santiago@restaurante.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-04 23:26:27', '2025-10-04 23:26:27'),
(5, 11, NULL, 'active', '2025-10-04', '2025-11-03', 'Hotel Amealco', NULL, NULL, 'aldo@hotelamealco.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-04 23:32:19', '2025-10-04 23:32:20'),
(6, 12, NULL, 'active', '2025-10-04', '2026-10-04', 'Rancho Paraiso Real', NULL, NULL, 'admin@ranchoparaisoreal.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-05 00:39:38', '2025-10-05 23:29:16'),
(7, 14, NULL, 'active', '2025-10-05', '2025-11-04', 'Hotel Vale', NULL, NULL, 'vale@hotelparadise.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-05 16:06:02', '2025-10-05 16:06:03'),
(8, 17, NULL, 'active', '2025-10-05', '2026-10-05', 'Cabañas Amealco', NULL, NULL, 'alejandro@impactosdigitales.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-05 20:21:15', '2025-10-05 20:21:15'),
(11, 24, NULL, 'active', '2025-10-05', '2026-10-05', 'Hotel Caballería', NULL, NULL, 'caballeria@ranchoparaisoreal.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-05 23:23:03', '2025-10-05 23:23:04'),
(12, 25, NULL, 'active', '2025-10-05', '2026-10-05', 'Hotel Rancho Amealco', NULL, NULL, 'amealcorancho@ranchoparaisoreal.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-05 23:24:24', '2025-10-05 23:24:25'),
(13, 26, NULL, 'trial', NULL, NULL, 'Cabañas Michoacán', NULL, NULL, 'michoacan@ranchoparaisoreal.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-05 23:25:30', '2025-10-05 23:25:30'),
(14, 35, NULL, 'trial', NULL, NULL, 'Hotel Morelia', NULL, NULL, 'luis@hotelmorelia.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-13 22:24:47', '2025-10-13 22:24:47'),
(15, 36, NULL, 'active', '2025-10-14', '2025-11-13', 'San Juan', NULL, NULL, 'dannabon@mayorbot.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-14 13:36:24', '2025-10-14 13:36:24'),
(16, 37, NULL, 'active', '2025-10-14', '2025-11-13', 'Meson de La Merced', NULL, NULL, 'idb@idb-hotels.mx', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-10-14 19:22:31', '2025-10-14 19:22:31'),
(17, 38, NULL, 'active', '2025-11-30', '2025-12-30', 'Hotel Crown Victoria', NULL, NULL, 'jane@impactosdigitales.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-11-30 21:15:00', '2025-11-30 21:15:00'),
(18, 39, NULL, 'trial', NULL, NULL, 'Ex Hacienda La Pitaya', NULL, NULL, 'hotelexhaciendalapitaya@gmail.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2025-11-30 21:29:47', '2025-11-30 21:29:47'),
(19, 40, NULL, 'active', '2026-03-11', '2027-03-11', 'Elonobot', NULL, NULL, 'andy@impactosdigitales.com', NULL, 50, 30, 20, NULL, 'America/Mexico_City', 'MXN', NULL, NULL, 1, '2026-03-12 00:36:04', '2026-03-12 00:36:04');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `hotel_settings`
--

CREATE TABLE `hotel_settings` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` text COLLATE utf8mb4_unicode_ci,
  `setting_type` enum('string','number','boolean','json') COLLATE utf8mb4_unicode_ci DEFAULT 'string',
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'general',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `hotel_settings`
--

INSERT INTO `hotel_settings` (`id`, `hotel_id`, `setting_key`, `setting_value`, `setting_type`, `category`, `updated_at`) VALUES
(1, 1, 'allow_table_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(2, 2, 'allow_table_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(3, 3, 'allow_table_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(4, 4, 'allow_table_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(5, 5, 'allow_table_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(6, 6, 'allow_table_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(7, 7, 'allow_table_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(8, 8, 'allow_table_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(9, 11, 'allow_table_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(10, 12, 'allow_table_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(11, 13, 'allow_table_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(24, 1, 'allow_room_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(25, 13, 'allow_room_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(26, 2, 'allow_room_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(27, 3, 'allow_room_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(28, 4, 'allow_room_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(29, 5, 'allow_room_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(30, 6, 'allow_room_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(31, 7, 'allow_room_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(32, 8, 'allow_room_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(33, 11, 'allow_room_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(34, 12, 'allow_room_overlap', '0', 'boolean', 'reservations', '2025-10-10 14:50:50'),
(39, 19, 'allow_table_overlap', '0', 'boolean', 'reservations', '2026-03-12 00:45:21'),
(40, 19, 'allow_room_overlap', '0', 'boolean', 'reservations', '2026-03-12 00:45:21'),
(41, 19, 'contact_phone', '', 'string', 'general', '2026-03-12 00:45:21'),
(42, 19, 'smtp_enabled', '0', 'boolean', 'email', '2026-03-12 00:45:21'),
(43, 19, 'smtp_host', 'mail.enolobot.digital', 'string', 'email', '2026-03-12 00:45:21'),
(44, 19, 'smtp_port', '465', 'number', 'email', '2026-03-12 00:45:21'),
(45, 19, 'smtp_username', 'hola@enolobot.digital', 'string', 'email', '2026-03-12 00:45:21'),
(46, 19, 'smtp_password', 'Danjohn007', 'string', 'email', '2026-03-12 00:45:21'),
(47, 19, 'smtp_encryption', 'ssl', 'string', 'email', '2026-03-12 00:45:21'),
(48, 19, 'smtp_from_email', 'hola@enolobot.digital', 'string', 'email', '2026-03-12 00:45:21'),
(49, 19, 'smtp_from_name', 'ElonoBot- Reservaciones', 'string', 'email', '2026-03-12 00:45:21');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `hotel_statistics`
--

CREATE TABLE `hotel_statistics` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `stat_date` date NOT NULL,
  `stat_type` enum('daily','weekly','monthly','yearly') COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_rooms` int(11) DEFAULT '0',
  `occupied_rooms` int(11) DEFAULT '0',
  `occupancy_rate` decimal(5,2) DEFAULT '0.00',
  `total_reservations` int(11) DEFAULT '0',
  `total_orders` int(11) DEFAULT '0',
  `total_revenue` decimal(12,2) DEFAULT '0.00',
  `room_revenue` decimal(12,2) DEFAULT '0.00',
  `food_revenue` decimal(12,2) DEFAULT '0.00',
  `service_revenue` decimal(12,2) DEFAULT '0.00',
  `average_daily_rate` decimal(10,2) DEFAULT '0.00',
  `data` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `hotel_subscriptions`
--

CREATE TABLE `hotel_subscriptions` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `plan_id` int(11) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `status` enum('trial','active','expired','cancelled','suspended') COLLATE utf8mb4_unicode_ci DEFAULT 'trial',
  `auto_renew` tinyint(1) DEFAULT '1',
  `payment_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_payment_date` date DEFAULT NULL,
  `next_payment_date` date DEFAULT NULL,
  `cancellation_reason` text COLLATE utf8mb4_unicode_ci,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `invoices`
--

CREATE TABLE `invoices` (
  `id` int(11) NOT NULL,
  `invoice_number` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `reservation_id` int(11) DEFAULT NULL,
  `reservation_type` enum('room','table') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoice_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `tax_rate` decimal(5,2) DEFAULT '0.00',
  `tax_amount` decimal(10,2) DEFAULT '0.00',
  `discount_amount` decimal(10,2) DEFAULT '0.00',
  `total_amount` decimal(10,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT 'MXN',
  `status` enum('draft','sent','paid','overdue','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `payment_terms` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `pdf_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `invoice_items`
--

CREATE TABLE `invoice_items` (
  `id` int(11) NOT NULL,
  `invoice_id` int(11) NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int(11) NOT NULL DEFAULT '1',
  `unit_price` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `tax_rate` decimal(5,2) DEFAULT '0.00',
  `tax_amount` decimal(10,2) DEFAULT '0.00',
  `total` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `loyalty_program`
--

CREATE TABLE `loyalty_program` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `referral_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_referrals` int(11) DEFAULT '0',
  `total_earnings` decimal(10,2) DEFAULT '0.00',
  `available_balance` decimal(10,2) DEFAULT '0.00',
  `withdrawn_balance` decimal(10,2) DEFAULT '0.00',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `loyalty_program`
--

INSERT INTO `loyalty_program` (`id`, `user_id`, `referral_code`, `total_referrals`, `total_earnings`, `available_balance`, `withdrawn_balance`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 7, 'B8E341F5', 0, 0.00, 0.00, 0.00, 1, '2025-10-04 22:47:17', '2025-10-04 22:47:17'),
(2, 1, 'CA4099E9', 0, 0.00, 0.00, 0.00, 1, '2025-10-05 00:47:01', '2025-10-05 00:47:01'),
(4, 12, 'BA27336D', 0, 0.00, 0.00, 0.00, 1, '2025-10-05 23:28:02', '2025-10-05 23:28:02');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `notifications`
--

CREATE TABLE `notifications` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `hotel_id` int(11) DEFAULT NULL,
  `type` enum('info','success','warning','error','reservation','order','service','payment','system') COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `action_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_id` int(11) DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `read_at` timestamp NULL DEFAULT NULL,
  `priority` enum('low','normal','high','urgent') COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `notification_preferences`
--

CREATE TABLE `notification_preferences` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `notification_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint(1) DEFAULT '1',
  `email_enabled` tinyint(1) DEFAULT '1',
  `push_enabled` tinyint(1) DEFAULT '1',
  `sms_enabled` tinyint(1) DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `orders`
--

CREATE TABLE `orders` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `guest_id` int(11) NOT NULL,
  `table_id` int(11) DEFAULT NULL,
  `room_id` int(11) DEFAULT NULL,
  `order_type` enum('dine_in','room_service','takeout') COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `tax_amount` decimal(10,2) DEFAULT '0.00',
  `discount_amount` decimal(10,2) DEFAULT '0.00',
  `tip_amount` decimal(10,2) DEFAULT '0.00',
  `subtotal` decimal(10,2) DEFAULT NULL,
  `payment_method` enum('cash','credit_card','debit_card','stripe','paypal','room_charge','complimentary') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_status` enum('pending','processing','completed','failed','refunded') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `paid_at` timestamp NULL DEFAULT NULL,
  `status` enum('pending','preparing','ready','delivered','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `order_items`
--

CREATE TABLE `order_items` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `dish_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `special_instructions` text COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `password_resets`
--

CREATE TABLE `password_resets` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `token` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expires_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `used` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `password_resets`
--

INSERT INTO `password_resets` (`id`, `user_id`, `token`, `expires_at`, `used`, `created_at`) VALUES
(1, 6, 'bde71634fb15014bd8387ae05834fb21edc619fa5eb9a8c4dfba0338968b36fb', '2025-10-04 22:12:50', 0, '2025-10-04 22:12:50');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `payment_transactions`
--

CREATE TABLE `payment_transactions` (
  `id` int(11) NOT NULL,
  `order_id` int(11) DEFAULT NULL,
  `reservation_id` int(11) DEFAULT NULL,
  `reservation_type` enum('room','table') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` int(11) NOT NULL,
  `subscription_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` varchar(3) COLLATE utf8mb4_unicode_ci DEFAULT 'MXN',
  `payment_method` enum('cash','credit_card','debit_card','stripe','paypal','bank_transfer') COLLATE utf8mb4_unicode_ci NOT NULL,
  `payment_gateway` enum('stripe','paypal','manual') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `transaction_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gateway_response` text COLLATE utf8mb4_unicode_ci,
  `status` enum('pending','processing','completed','failed','refunded','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `processed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `payment_proof` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Nombre del archivo de comprobante de pago',
  `transaction_reference` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Referencia o folio de transacción'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `payment_transactions`
--

INSERT INTO `payment_transactions` (`id`, `order_id`, `reservation_id`, `reservation_type`, `user_id`, `subscription_id`, `amount`, `currency`, `payment_method`, `payment_gateway`, `transaction_id`, `gateway_response`, `status`, `error_message`, `processed_at`, `created_at`, `payment_proof`, `transaction_reference`) VALUES
(1, NULL, NULL, NULL, 17, 3, 4990.00, 'MXN', '', NULL, 'TXN_A315275C92', NULL, 'pending', NULL, NULL, '2025-10-05 20:21:15', 'payment_17_1759695675.jpeg', '223'),
(4, NULL, NULL, NULL, 25, 3, 4990.00, 'MXN', '', NULL, 'TXN_C2AF652A9E', NULL, 'pending', NULL, NULL, '2025-10-05 23:24:25', 'payment_25_1759706665.jpeg', '4');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `referrals`
--

CREATE TABLE `referrals` (
  `id` int(11) NOT NULL,
  `referrer_id` int(11) NOT NULL,
  `referred_user_id` int(11) NOT NULL,
  `referral_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','completed','paid') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `commission_percentage` decimal(5,2) DEFAULT '10.00',
  `commission_amount` decimal(10,2) DEFAULT '0.00',
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `reports`
--

CREATE TABLE `reports` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `report_type` enum('occupancy','revenue','reservations','orders','staff_performance','customer_satisfaction','custom') COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `parameters` json DEFAULT NULL,
  `schedule` enum('once','daily','weekly','monthly') COLLATE utf8mb4_unicode_ci DEFAULT 'once',
  `format` enum('pdf','excel','csv','html') COLLATE utf8mb4_unicode_ci DEFAULT 'pdf',
  `recipients` text COLLATE utf8mb4_unicode_ci,
  `last_generated_at` timestamp NULL DEFAULT NULL,
  `next_generation_at` timestamp NULL DEFAULT NULL,
  `status` enum('active','paused','completed') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `report_generations`
--

CREATE TABLE `report_generations` (
  `id` int(11) NOT NULL,
  `report_id` int(11) NOT NULL,
  `file_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` int(11) DEFAULT NULL,
  `status` enum('generating','completed','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'generating',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `generated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `resource_blocks`
--

CREATE TABLE `resource_blocks` (
  `id` int(11) NOT NULL,
  `resource_type` enum('room','table','amenity') COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_id` int(11) NOT NULL,
  `blocked_by` int(11) NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` enum('active','released') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `resource_blocks`
--

INSERT INTO `resource_blocks` (`id`, `resource_type`, `resource_id`, `blocked_by`, `reason`, `start_date`, `end_date`, `status`, `created_at`, `updated_at`) VALUES
(1, 'table', 7, 3, 'Mantenimiento de mesa', '2025-10-04', '2025-10-07', 'released', '2025-10-04 18:02:35', '2025-10-05 17:23:43'),
(2, 'amenity', 14, 1, 'Reservación confirmada - Dan Raso', '2025-10-05', '2025-10-05', 'active', '2025-10-05 21:43:51', '2025-10-05 21:43:51'),
(3, 'amenity', 15, 21, 'Reservación confirmada - Luisa Hae', '2025-10-05', '2025-10-05', 'active', '2025-10-05 22:05:05', '2025-10-05 22:05:05'),
(4, 'table', 17, 21, 'Reservación confirmada - Luisa Hae', '2025-10-08', '2025-10-08', 'active', '2025-10-05 22:05:09', '2025-10-05 22:05:09'),
(5, 'table', 17, 21, 'Reservación confirmada - Luisa Hae', '2025-10-07', '2025-10-07', 'active', '2025-10-05 23:34:21', '2025-10-05 23:34:21'),
(6, 'amenity', 18, 6, 'Reservación confirmada - Dan Raso', '2025-10-26', '2025-10-26', 'active', '2025-10-06 02:53:55', '2025-10-06 02:53:55'),
(7, 'table', 18, 20, 'Reservación confirmada - Luisa Hae', '2025-10-14', '2025-10-14', 'active', '2025-10-06 05:28:14', '2025-10-06 05:28:14'),
(8, 'amenity', 17, 6, 'Reservación confirmada - Dan Raso', '2025-10-16', '2025-10-16', 'active', '2025-10-06 05:30:17', '2025-10-06 05:30:17'),
(9, 'amenity', 17, 6, 'Reservación confirmada - Miguel Cervantes', '2025-10-16', '2025-10-16', 'active', '2025-10-06 06:43:02', '2025-10-06 06:43:02'),
(10, 'amenity', 19, 29, 'Reservación confirmada - Roberto Palazuelos', '2025-10-12', '2025-10-12', 'active', '2025-10-06 17:30:13', '2025-10-06 17:30:13'),
(11, 'amenity', 18, 6, 'Reservación confirmada - Miguel Cervantes', '2025-10-05', '2025-10-05', 'active', '2025-10-06 17:39:58', '2025-10-06 17:39:58'),
(12, 'amenity', 13, 1, 'Reservación confirmada - Dan Raso', '2025-10-05', '2025-10-05', 'active', '2025-10-07 00:35:00', '2025-10-07 00:35:00');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `resource_images`
--

CREATE TABLE `resource_images` (
  `id` int(11) NOT NULL,
  `resource_type` enum('room','table','amenity') COLLATE utf8mb4_unicode_ci NOT NULL,
  `resource_id` int(11) NOT NULL,
  `image_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_order` int(11) DEFAULT '0',
  `is_primary` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stores images for rooms, tables, and amenities. Multiple images per resource allowed.';

--
-- Volcado de datos para la tabla `resource_images`
--

INSERT INTO `resource_images` (`id`, `resource_type`, `resource_id`, `image_path`, `display_order`, `is_primary`, `created_at`, `updated_at`) VALUES
(7, 'table', 14, 'uploads/tables/table_14_68e2ab612cff4.jpg', 0, 1, '2025-10-05 17:31:13', '2025-10-05 17:31:13'),
(8, 'table', 14, 'uploads/tables/table_14_68e2ab612d5b9.jpg', 1, 0, '2025-10-05 17:31:13', '2025-10-05 17:31:13'),
(9, 'table', 14, 'uploads/tables/table_14_68e2ab612d928.jpg', 2, 0, '2025-10-05 17:31:13', '2025-10-05 17:31:13'),
(10, 'table', 15, 'uploads/tables/table_15_68e2b2f5593b3.jpeg', 0, 1, '2025-10-05 18:03:33', '2025-10-05 18:03:33'),
(11, 'table', 15, 'uploads/tables/table_15_68e2b2f55975b.jpeg', 1, 0, '2025-10-05 18:03:33', '2025-10-05 18:03:33'),
(12, 'table', 15, 'uploads/tables/table_15_68e2b2f559a20.jpeg', 2, 0, '2025-10-05 18:03:33', '2025-10-05 18:03:33'),
(13, 'table', 15, 'uploads/tables/table_15_68e2b2f559cb7.jpeg', 3, 0, '2025-10-05 18:03:33', '2025-10-05 18:03:33'),
(17, 'table', 16, 'uploads/tables/table_16_68e2c18e7a03e.jpeg', 0, 1, '2025-10-05 19:05:50', '2025-10-05 19:05:50'),
(18, 'table', 16, 'uploads/tables/table_16_68e2c18e7a313.jpeg', 1, 0, '2025-10-05 19:05:50', '2025-10-05 19:05:50'),
(19, 'table', 16, 'uploads/tables/table_16_68e2c18e7a516.jpeg', 2, 0, '2025-10-05 19:05:50', '2025-10-05 19:05:50'),
(20, 'table', 16, 'uploads/tables/table_16_68e2c18e7a6aa.jpeg', 3, 0, '2025-10-05 19:05:50', '2025-10-05 19:05:50'),
(23, 'amenity', 14, 'uploads/amenities/amenity_14_68e2d58cd519f.jpeg', 0, 1, '2025-10-05 20:31:08', '2025-10-05 20:31:08'),
(24, 'amenity', 14, 'uploads/amenities/amenity_14_68e2d58cd5519.jpeg', 1, 0, '2025-10-05 20:31:08', '2025-10-05 20:31:08'),
(25, 'amenity', 14, 'uploads/amenities/amenity_14_68e2d58cd5776.jpeg', 2, 0, '2025-10-05 20:31:08', '2025-10-05 20:31:08'),
(26, 'amenity', 14, 'uploads/amenities/amenity_14_68e2d58cd59cc.jpeg', 3, 0, '2025-10-05 20:31:08', '2025-10-05 20:31:08'),
(27, 'room', 14, 'uploads/rooms/room_14_68e2e313b6845.jpeg', 0, 0, '2025-10-05 21:28:51', '2025-10-05 21:28:59'),
(28, 'room', 14, 'uploads/rooms/room_14_68e2e313b6a4f.jpeg', 1, 0, '2025-10-05 21:28:51', '2025-10-05 21:28:51'),
(29, 'room', 14, 'uploads/rooms/room_14_68e2e313b6e0d.jpeg', 2, 1, '2025-10-05 21:28:51', '2025-10-05 21:28:59'),
(30, 'amenity', 15, 'uploads/amenities/amenity_15_68e2e8971fc44.jpeg', 0, 0, '2025-10-05 21:52:23', '2025-10-05 21:53:18'),
(31, 'amenity', 15, 'uploads/amenities/amenity_15_68e2e8971fea2.jpeg', 1, 0, '2025-10-05 21:52:23', '2025-10-05 21:52:23'),
(32, 'amenity', 15, 'uploads/amenities/amenity_15_68e2e8971fff7.jpeg', 2, 1, '2025-10-05 21:52:23', '2025-10-05 21:53:18'),
(33, 'table', 17, 'uploads/tables/table_17_68e2ed7d37ced.jpeg', 0, 1, '2025-10-05 22:13:17', '2025-10-05 22:13:17'),
(34, 'table', 17, 'uploads/tables/table_17_68e2ed7d37f7d.jpeg', 1, 0, '2025-10-05 22:13:17', '2025-10-05 22:13:17'),
(35, 'table', 17, 'uploads/tables/table_17_68e2ed7d38143.jpeg', 2, 0, '2025-10-05 22:13:17', '2025-10-05 22:13:17'),
(36, 'room', 15, 'uploads/rooms/room_15_68e300c58ba9f.jpeg', 0, 1, '2025-10-05 23:35:33', '2025-10-05 23:35:33'),
(37, 'amenity', 16, 'uploads/amenities/amenity_16_68e3055fd5f57.jpeg', 0, 1, '2025-10-05 23:55:11', '2025-10-05 23:55:11'),
(38, 'amenity', 16, 'uploads/amenities/amenity_16_68e3055fd6185.jpeg', 1, 0, '2025-10-05 23:55:11', '2025-10-05 23:55:11'),
(39, 'amenity', 16, 'uploads/amenities/amenity_16_68e3055fd62e4.jpeg', 2, 0, '2025-10-05 23:55:11', '2025-10-05 23:55:11'),
(81, 'room', 10, 'uploads/rooms/room_10_68e4613f82b80.jpeg', 0, 1, '2025-10-07 00:39:27', '2025-10-07 00:39:27'),
(82, 'amenity', 13, 'uploads/amenities/amenity_13_68e46199366d6.jpeg', 0, 1, '2025-10-07 00:40:57', '2025-10-07 00:40:57'),
(83, 'amenity', 12, 'uploads/amenities/amenity_12_68e461ac54311.png', 0, 1, '2025-10-07 00:41:16', '2025-10-07 00:41:16'),
(86, 'room', 18, 'uploads/rooms/room_18_68e53bc07f7a0.jpeg', 0, 1, '2025-10-07 16:11:44', '2025-10-07 16:11:44'),
(87, 'table', 18, 'uploads/tables/table_18_68e53c017b0fd.jpeg', 0, 1, '2025-10-07 16:12:49', '2025-10-07 16:12:49'),
(88, 'amenity', 18, 'uploads/amenities/amenity_18_68e53c34e7fa2.jpeg', 0, 1, '2025-10-07 16:13:40', '2025-10-07 16:13:40'),
(89, 'amenity', 19, 'uploads/amenities/amenity_19_68e53c5b07d0f.jpeg', 0, 1, '2025-10-07 16:14:19', '2025-10-07 16:14:19'),
(90, 'room', 17, 'uploads/rooms/room_17_68e53caba833b.jpeg', 0, 1, '2025-10-07 16:15:39', '2025-10-07 16:15:39'),
(91, 'amenity', 17, 'uploads/amenities/amenity_17_68e53dbeecd4d.jpeg', 0, 1, '2025-10-07 16:20:14', '2025-10-07 16:20:14'),
(95, 'amenity', 20, 'uploads/amenities/amenity_20_68e53ea14f0df.jpeg', 0, 1, '2025-10-07 16:24:01', '2025-10-07 16:24:01'),
(97, 'table', 20, 'uploads/tables/table_20_68e53efb43a10.jpeg', 0, 1, '2025-10-07 16:25:31', '2025-10-07 16:25:31'),
(98, 'room', 1, 'uploads/rooms/room_1_68e578a2cdb9e.png', 0, 0, '2025-10-07 20:31:30', '2025-10-07 20:31:51'),
(99, 'room', 1, 'uploads/rooms/room_1_68e578a2cdd3f.jpeg', 1, 0, '2025-10-07 20:31:30', '2025-10-07 20:31:30'),
(100, 'room', 1, 'uploads/rooms/room_1_68e578a2cdeda.jpeg', 2, 0, '2025-10-07 20:31:30', '2025-10-07 20:31:30'),
(101, 'room', 1, 'uploads/rooms/room_1_68e578a2ce064.jpeg', 3, 0, '2025-10-07 20:31:30', '2025-10-07 20:31:30'),
(102, 'room', 1, 'uploads/rooms/room_1_68e578a2ce1ae.jpeg', 4, 0, '2025-10-07 20:31:30', '2025-10-07 20:31:30'),
(103, 'room', 1, 'uploads/rooms/room_1_68e578a2ce349.jpeg', 5, 1, '2025-10-07 20:31:30', '2025-10-07 20:31:51'),
(104, 'table', 6, 'uploads/tables/table_6_68e578d59f6ff.jpeg', 0, 0, '2025-10-07 20:32:21', '2025-10-07 20:32:27'),
(105, 'table', 6, 'uploads/tables/table_6_68e578d59f8f0.jpeg', 1, 1, '2025-10-07 20:32:21', '2025-10-07 20:32:27'),
(106, 'amenity', 21, 'uploads/amenities/amenity_21_68e8754dbff82.jpeg', 0, 1, '2025-10-10 02:54:05', '2025-10-10 02:54:05'),
(107, 'amenity', 21, 'uploads/amenities/amenity_21_68e8754dc034d.jpeg', 1, 0, '2025-10-10 02:54:05', '2025-10-10 02:54:05'),
(109, 'amenity', 23, 'uploads/amenities/amenity_23_68e95ff12b86b.jpeg', 0, 1, '2025-10-10 19:35:13', '2025-10-10 19:35:13'),
(111, 'table', 19, 'uploads/tables/table_19_68ebbfa1000c2.jpeg', 0, 1, '2025-10-12 14:48:01', '2025-10-12 14:48:01'),
(113, 'room', 16, 'uploads/rooms/room_16_68ebcfee48c3e.jpeg', 0, 1, '2025-10-12 15:57:34', '2025-10-12 15:57:34'),
(114, 'room', 19, 'uploads/rooms/room_19_692cb7aebb59a.png', 0, 1, '2025-11-30 21:31:26', '2025-11-30 21:31:26');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `restaurant_tables`
--

CREATE TABLE `restaurant_tables` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `table_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `capacity` int(11) NOT NULL,
  `location` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('available','occupied','reserved','blocked') COLLATE utf8mb4_unicode_ci DEFAULT 'available',
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `restaurant_tables`
--

INSERT INTO `restaurant_tables` (`id`, `hotel_id`, `table_number`, `capacity`, `location`, `status`, `description`, `created_at`, `updated_at`) VALUES
(1, 1, 'T1', 2, 'Terraza', 'available', 'Mesa para dos con vista al mar', '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(2, 1, 'T2', 4, 'Terraza', 'available', 'Mesa para cuatro en terraza', '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(3, 1, 'S1', 4, 'Salón principal', 'available', 'Mesa en salón con clima', '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(4, 1, 'S2', 6, 'Salón principal', 'occupied', 'Mesa grande para grupos', '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(5, 1, 'S3', 2, 'Salón principal', 'reserved', 'Mesa romántica cerca de la ventana', '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(6, 1, 'B1', 8, 'Salón de banquetes', 'available', 'Mesa para eventos especiales', '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(7, 1, 'T3', 2, 'Terraza', 'blocked', 'Mesa en mantenimiento', '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(8, 1, 'S4', 4, 'Salón principal', 'available', 'Mesa estándar', '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(9, 5, '1', 4, 'Salón', 'available', 'Mesa', '2025-10-04 23:33:18', '2025-10-04 23:33:18'),
(10, 7, '1', 4, 'Terraza', 'available', 'Mesa 1', '2025-10-05 16:23:41', '2025-10-05 16:23:41'),
(11, 7, '2', 4, 'Salón', 'available', 'Mesa 2', '2025-10-05 16:23:52', '2025-10-05 16:25:01'),
(12, 7, '3', 10, 'Salón', 'available', 'Mesa 2', '2025-10-05 16:24:10', '2025-10-05 16:24:31'),
(13, 7, '4', 4, 'Terraza', 'available', 'Mesa 4', '2025-10-05 17:29:20', '2025-10-05 17:29:20'),
(17, 8, 'M1', 4, 'Salón', 'available', 'Mesa 1', '2025-10-05 20:22:50', '2025-10-05 22:13:17'),
(18, 6, 'S1', 10, 'Salón', 'available', 'Mesa 1 Salon', '2025-10-06 00:38:45', '2025-10-06 00:38:45'),
(19, 6, 'S2', 10, 'Mesa 2 Salon', 'available', 'Mesa 2 Salón para 10 personas.', '2025-10-06 00:39:04', '2025-10-12 14:46:32'),
(20, 6, 'T1', 4, 'Terraza', 'available', 'Terraza 1', '2025-10-06 17:23:26', '2025-10-06 17:23:26');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `role_permissions`
--

CREATE TABLE `role_permissions` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `role_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `can_manage_rooms` tinyint(1) DEFAULT '0',
  `can_manage_tables` tinyint(1) DEFAULT '0',
  `can_manage_menu` tinyint(1) DEFAULT '0',
  `amenity_ids` text COLLATE utf8mb4_unicode_ci COMMENT 'JSON array de IDs de amenidades asignadas',
  `service_types` text COLLATE utf8mb4_unicode_ci COMMENT 'JSON array de tipos de servicios asignados',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `role_permissions`
--

INSERT INTO `role_permissions` (`id`, `hotel_id`, `user_id`, `role_name`, `can_manage_rooms`, `can_manage_tables`, `can_manage_menu`, `amenity_ids`, `service_types`, `created_at`, `updated_at`, `created_by`) VALUES
(1, 1, 1, 'admin', 1, 1, 1, NULL, NULL, '2025-10-05 13:49:01', '2025-10-05 14:08:34', NULL),
(2, 1, 2, 'manager', 1, 1, 1, NULL, NULL, '2025-10-05 13:49:01', '2025-10-05 14:08:34', NULL),
(3, 1, 3, 'hostess', 0, 1, 0, NULL, NULL, '2025-10-05 13:49:01', '2025-10-05 14:08:34', NULL),
(4, 1, 4, 'collaborator', 0, 0, 0, NULL, NULL, '2025-10-05 13:49:01', '2025-10-05 14:08:34', NULL),
(5, 2, 8, 'admin', 1, 1, 1, NULL, NULL, '2025-10-05 13:49:01', '2025-10-05 14:08:34', NULL),
(6, 3, 9, 'admin', 1, 1, 1, NULL, NULL, '2025-10-05 13:49:01', '2025-10-05 14:08:34', NULL),
(7, 4, 10, 'admin', 1, 1, 1, NULL, NULL, '2025-10-05 13:49:01', '2025-10-05 14:08:34', NULL),
(8, 5, 11, 'admin', 1, 1, 1, NULL, NULL, '2025-10-05 13:49:01', '2025-10-05 14:08:34', NULL),
(9, 6, 12, 'admin', 1, 1, 1, NULL, NULL, '2025-10-05 13:49:01', '2025-10-05 14:08:34', NULL),
(18, 7, 31, 'collaborator', 0, 1, 0, NULL, NULL, '2025-10-07 00:38:44', '2025-10-07 00:38:44', 14),
(19, 6, 32, 'hostess', 1, 1, 0, '[19,17]', '[\"room_service\",\"concierge\"]', '2025-10-07 05:35:16', '2025-10-07 05:35:16', 12),
(20, 6, 34, 'hostess', 1, 1, 1, '[22,18,23,21]', '[\"cleaning\",\"maintenance\",\"room_service\",\"concierge\"]', '2025-10-12 14:57:14', '2025-10-12 14:57:14', 12);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `rooms`
--

CREATE TABLE `rooms` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `room_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('single','double','suite','deluxe','presidential') COLLATE utf8mb4_unicode_ci NOT NULL,
  `capacity` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `status` enum('available','occupied','maintenance','reserved') COLLATE utf8mb4_unicode_ci DEFAULT 'available',
  `floor` int(11) DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `amenities` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `price_monday` decimal(10,2) DEFAULT NULL COMMENT 'Precio para lunes',
  `price_tuesday` decimal(10,2) DEFAULT NULL COMMENT 'Precio para martes',
  `price_wednesday` decimal(10,2) DEFAULT NULL COMMENT 'Precio para miércoles',
  `price_thursday` decimal(10,2) DEFAULT NULL COMMENT 'Precio para jueves',
  `price_friday` decimal(10,2) DEFAULT NULL COMMENT 'Precio para viernes',
  `price_saturday` decimal(10,2) DEFAULT NULL COMMENT 'Precio para sábado',
  `price_sunday` decimal(10,2) DEFAULT NULL COMMENT 'Precio para domingo'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `rooms`
--

INSERT INTO `rooms` (`id`, `hotel_id`, `room_number`, `type`, `capacity`, `price`, `status`, `floor`, `description`, `amenities`, `created_at`, `updated_at`, `price_monday`, `price_tuesday`, `price_wednesday`, `price_thursday`, `price_friday`, `price_saturday`, `price_sunday`) VALUES
(1, 1, '101', 'single', 1, 150.00, 'available', 1, 'Habitación individual con vista al jardín', 'TV, WiFi, Aire acondicionado, Mini-bar', '2025-10-04 18:02:35', '2025-10-12 15:49:09', 150.00, 150.00, 150.00, 150.00, 150.00, 150.00, 150.00),
(2, 1, '102', 'double', 2, 250.00, 'available', 1, 'Habitación doble con balcón', 'TV, WiFi, Aire acondicionado, Mini-bar, Balcón', '2025-10-04 18:02:35', '2025-10-12 15:49:09', 250.00, 250.00, 250.00, 250.00, 250.00, 250.00, 250.00),
(3, 1, '201', 'suite', 4, 500.00, 'available', 2, 'Suite familiar con sala de estar', 'TV, WiFi, Aire acondicionado, Mini-bar, Sala, Jacuzzi', '2025-10-04 18:02:35', '2025-10-12 15:49:09', 500.00, 500.00, 500.00, 500.00, 500.00, 500.00, 500.00),
(4, 1, '202', 'deluxe', 2, 400.00, 'occupied', 2, 'Habitación deluxe con vista al mar', 'TV, WiFi, Aire acondicionado, Mini-bar premium, Vista al mar', '2025-10-04 18:02:35', '2025-10-12 15:49:09', 400.00, 400.00, 400.00, 400.00, 400.00, 400.00, 400.00),
(5, 1, '301', 'presidential', 6, 1200.00, 'available', 3, 'Suite presidencial con terraza privada', 'Smart TV, WiFi, Climatización, Bar completo, Cocina, Terraza, Jacuzzi, Vista panorámica', '2025-10-04 18:02:35', '2025-10-12 15:49:09', 1200.00, 1200.00, 1200.00, 1200.00, 1200.00, 1200.00, 1200.00),
(6, 1, '103', 'double', 2, 250.00, 'maintenance', 1, 'Habitación doble estándar', 'TV, WiFi, Aire acondicionado, Mini-bar', '2025-10-04 18:02:35', '2025-10-12 15:49:09', 250.00, 250.00, 250.00, 250.00, 250.00, 250.00, 250.00),
(7, 1, '104', 'single', 1, 150.00, 'available', 1, 'Habitación individual estándar', 'TV, WiFi, Aire acondicionado', '2025-10-04 18:02:35', '2025-10-12 15:49:09', 150.00, 150.00, 150.00, 150.00, 150.00, 150.00, 150.00),
(8, 1, '203', 'suite', 4, 500.00, 'reserved', 2, 'Suite junior con jacuzzi', 'TV, WiFi, Aire acondicionado, Mini-bar, Jacuzzi', '2025-10-04 18:02:35', '2025-10-12 15:49:09', 500.00, 500.00, 500.00, 500.00, 500.00, 500.00, 500.00),
(9, 5, '1', 'presidential', 5, 3000.00, 'available', 1, 'Suite', 'TV', '2025-10-04 23:33:00', '2025-10-12 15:49:09', 3000.00, 3000.00, 3000.00, 3000.00, 3000.00, 3000.00, 3000.00),
(10, 7, '1', 'double', 2, 1800.00, 'available', 1, 'Habitación 1', '', '2025-10-05 16:16:27', '2025-10-12 15:49:09', 1800.00, 1800.00, 1800.00, 1800.00, 1800.00, 1800.00, 1800.00),
(11, 7, '2', 'deluxe', 4, 2800.00, 'available', 1, 'Habitacion 2', '', '2025-10-05 16:16:46', '2025-10-12 15:49:09', 2800.00, 2800.00, 2800.00, 2800.00, 2800.00, 2800.00, 2800.00),
(12, 7, '3', 'suite', 8, 4500.00, 'available', 2, 'Habitacion 3', '', '2025-10-05 16:17:10', '2025-10-12 15:49:09', 4500.00, 4500.00, 4500.00, 4500.00, 4500.00, 4500.00, 4500.00),
(13, 7, '4', 'double', 8, 2500.00, 'available', 2, 'Habitación 4', '', '2025-10-05 17:31:58', '2025-10-12 15:49:09', 2500.00, 2500.00, 2500.00, 2500.00, 2500.00, 2500.00, 2500.00),
(14, 8, '1', 'single', 2, 1500.00, 'available', 1, 'Habitación 1', '', '2025-10-05 20:22:05', '2025-10-12 15:49:09', 1500.00, 1500.00, 1500.00, 1500.00, 1500.00, 1500.00, 1500.00),
(15, 8, '2', 'suite', 4, 2500.00, 'available', 1, 'Habitación 2', '', '2025-10-05 21:36:23', '2025-10-12 15:49:09', 2500.00, 2500.00, 2500.00, 2500.00, 2500.00, 2500.00, 2500.00),
(16, 6, 'Casa Blanca', 'suite', 8, 4500.00, 'available', 1, 'Casa Blanca con 2 Habitaciones y 2 Baños', '', '2025-10-06 00:36:28', '2025-10-12 15:56:34', 3500.00, 3500.00, 3500.00, 3500.00, 4500.00, 4500.00, 4500.00),
(17, 6, 'Gemelita 1', 'suite', 4, 3000.00, 'available', 1, 'Gemelita 1', '', '2025-10-06 00:37:05', '2025-10-12 15:49:09', 3000.00, 3000.00, 3000.00, 3000.00, 3000.00, 3000.00, 3000.00),
(18, 6, 'Gemelita 2', 'suite', 4, 3000.00, 'available', 1, 'Gemelita 2', '', '2025-10-06 00:37:35', '2025-10-12 15:49:09', 3000.00, 3000.00, 3000.00, 3000.00, 3000.00, 3000.00, 3000.00),
(19, 18, '101', 'double', 4, 1800.00, 'available', 1, '', '', '2025-11-30 21:31:26', '2025-11-30 21:31:26', 1600.00, 1700.00, 1800.00, 1800.00, 2000.00, 2200.00, 1800.00);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `room_reservations`
--

CREATE TABLE `room_reservations` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `room_id` int(11) NOT NULL,
  `guest_id` int(11) DEFAULT NULL,
  `guest_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `guest_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `guest_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `check_in` date NOT NULL,
  `check_out` date NOT NULL,
  `total_price` decimal(10,2) NOT NULL,
  `discount_code_id` int(11) DEFAULT NULL,
  `discount_amount` decimal(10,2) DEFAULT '0.00',
  `original_price` decimal(10,2) DEFAULT NULL,
  `status` enum('pending','confirmed','checked_in','checked_out','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `notification_sent` tinyint(1) DEFAULT '0',
  `confirmation_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_confirmed` tinyint(1) DEFAULT '0',
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `special_requests` text COLLATE utf8mb4_unicode_ci,
  `number_of_guests` int(11) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `guest_birthday` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `room_reservations`
--

INSERT INTO `room_reservations` (`id`, `hotel_id`, `room_id`, `guest_id`, `guest_name`, `guest_email`, `guest_phone`, `check_in`, `check_out`, `total_price`, `discount_code_id`, `discount_amount`, `original_price`, `status`, `notification_sent`, `confirmation_code`, `email_confirmed`, `confirmed_at`, `notes`, `special_requests`, `number_of_guests`, `created_at`, `updated_at`, `guest_birthday`) VALUES
(1, 1, 4, 5, NULL, NULL, NULL, '2025-10-04', '2025-10-07', 1200.00, NULL, 0.00, NULL, 'checked_in', 1, NULL, 0, NULL, 'Llegó temprano, se realizó check-in anticipado', NULL, 1, '2025-10-04 18:02:35', '2025-10-05 19:49:39', NULL),
(3, 7, 11, NULL, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', '2025-10-05', '2025-10-07', 0.00, NULL, 0.00, NULL, 'cancelled', 0, NULL, 0, NULL, NULL, '', 1, '2025-10-05 20:11:35', '2025-10-07 00:36:17', NULL),
(4, 8, 14, NULL, 'Dan Raso', 'webmaster@impactosdigitales.com', '4425986318', '2025-10-05', '2025-10-06', 0.00, NULL, 0.00, NULL, 'confirmed', 0, NULL, 0, NULL, NULL, '', 1, '2025-10-05 20:33:21', '2025-10-05 20:55:40', NULL),
(5, 8, 15, 6, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', '2025-10-05', '2025-10-07', 0.00, NULL, 0.00, NULL, 'pending', 0, NULL, 0, NULL, NULL, '', 1, '2025-10-05 22:43:03', '2025-10-05 22:43:03', NULL),
(6, 6, 16, 6, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', '2025-10-11', '2025-10-12', 0.00, NULL, 0.00, NULL, 'pending', 0, NULL, 0, NULL, NULL, '', 1, '2025-10-06 00:42:18', '2025-10-06 00:42:18', NULL),
(7, 6, 17, 21, 'Dan Raso', 'dan@impactosdigitales.com', '2183629869', '2025-10-15', '2025-10-16', 0.00, NULL, 0.00, NULL, 'checked_in', 0, NULL, 0, NULL, '', '', 1, '2025-10-06 05:25:01', '2025-10-06 06:43:26', NULL),
(8, 6, 18, 28, 'Graciela Rios', 'chelitario@hotmail.com', '3247907049', '2025-10-16', '2025-10-22', 0.00, NULL, 0.00, NULL, 'confirmed', 0, NULL, 0, NULL, '', '', 1, '2025-10-06 15:27:00', '2025-10-07 05:31:07', NULL),
(9, 6, 18, 19, 'Luisa Hae', 'sandy@impactosdigitales.com', '8271358122', '2025-10-12', '2025-10-13', 0.00, NULL, 0.00, NULL, 'pending', 0, NULL, 0, NULL, NULL, 'Habitación: 4. ', 1, '2025-10-06 15:47:56', '2025-10-06 15:47:56', NULL),
(10, 6, 17, 6, 'Miguel Cervantes', 'oscarbarry16@gmail.com', '4425986318', '2025-10-12', '2025-10-26', 0.00, NULL, 0.00, NULL, 'confirmed', 0, NULL, 0, NULL, NULL, '', 1, '2025-10-06 16:34:11', '2025-10-06 17:30:24', NULL),
(11, 6, 17, 30, 'Kenia Jimenez', 'keniakim@id.com', '2198273197', '2025-10-10', '2025-10-11', 0.00, NULL, 0.00, NULL, 'cancelled', 0, NULL, 0, NULL, '', '', 1, '2025-10-06 17:31:49', '2025-10-10 14:58:17', NULL),
(12, 6, 16, 33, 'Andres Perez', 'andyperez@id.com', '2831698927', '2025-10-09', '2025-10-11', 0.00, NULL, 0.00, NULL, 'cancelled', 0, NULL, 0, NULL, NULL, '', 1, '2025-10-07 18:48:48', '2025-10-10 14:58:07', NULL),
(13, 6, 18, 5, 'Roberto Ejemplo', 'driverguardado10@gmail.com', '+52 4427869806', '2025-10-13', '2025-10-20', 21000.00, NULL, 0.00, NULL, 'pending', 0, NULL, 0, NULL, NULL, NULL, 1, '2025-10-10 15:56:45', '2025-10-10 15:56:45', NULL),
(14, 6, 18, 5, 'Roberto Ejemplo', 'roberto@example.com', '+52 4427869806', '2025-10-12', '2025-10-21', 27000.00, NULL, 0.00, NULL, 'pending', 0, NULL, 0, NULL, NULL, NULL, 1, '2025-10-10 17:04:24', '2025-10-10 17:04:24', NULL),
(15, 6, 18, 5, 'Roberto Ejemplo', 'roberto@example.com', '+52 4427869806', '2099-01-01', '2099-01-02', 0.00, NULL, 0.00, NULL, '', 0, NULL, 0, NULL, '{\"step\":\"dates\",\"roomId\":18,\"roomPrice\":3000,\"roomNumber\":\"Gemelita 2\",\"roomType\":\"suite\",\"waiting\":null}', NULL, 1, '2025-10-10 18:17:22', '2025-10-10 18:17:31', NULL),
(16, 6, 18, 5, 'Roberto Ejemplo', 'roberto@example.com', '+52 4427869806', '2099-01-01', '2099-01-02', 0.00, NULL, 0.00, NULL, '', 0, NULL, 0, NULL, '{\"step\":\"dates\",\"roomId\":18,\"roomPrice\":3000,\"roomNumber\":\"Gemelita 2\",\"roomType\":\"suite\",\"waiting\":null}', NULL, 1, '2025-10-10 18:18:22', '2025-10-10 18:18:26', NULL),
(17, 6, 17, 5, 'Roberto Ejemplo', 'roberto@example.com', '+52 4427869806', '2025-10-12', '2025-10-18', 18000.00, NULL, 0.00, NULL, 'pending', 0, NULL, 0, NULL, NULL, NULL, 1, '2025-10-10 19:35:22', '2025-10-10 19:35:22', NULL),
(18, 6, 16, 6, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', '2025-10-15', '2025-10-20', 22500.00, NULL, 0.00, NULL, 'pending', 0, NULL, 0, NULL, NULL, NULL, 1, '2025-10-10 19:40:20', '2025-10-10 19:40:20', NULL),
(19, 6, 16, 5, 'Roberto Ejemplo', 'roberto@example.com', '+52 4427869806', '2025-10-12', '2025-10-15', 13500.00, NULL, 0.00, NULL, 'pending', 0, NULL, 0, NULL, NULL, NULL, 1, '2025-10-10 20:15:56', '2025-10-10 20:16:23', NULL),
(20, 6, 16, 5, 'Roberto Ejemplo', 'roberto@example.com', '+52 4427869806', '0000-00-00', '0000-00-00', 0.00, NULL, 0.00, NULL, '', 0, NULL, 0, NULL, NULL, NULL, 1, '2025-10-10 20:57:50', '2025-10-10 20:57:50', NULL),
(21, 6, 16, 6, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', '2025-10-15', '2025-10-16', 4500.00, NULL, 0.00, NULL, 'pending', 0, NULL, 0, NULL, '', NULL, 1, '2025-10-10 21:44:16', '2025-10-13 21:05:47', '1979-09-21'),
(22, 6, 17, 27, 'Dan Raso', 'oscarbarry16@gmail.com', '4424865390', '2025-10-16', '2025-10-19', 3000.00, NULL, 0.00, NULL, 'pending', 0, NULL, 0, NULL, '', NULL, 1, '2025-10-14 18:30:18', '2025-10-14 18:30:18', NULL),
(23, 6, 18, 27, 'Dan Raso', 'oscarbarry16@gmail.com', '4424865390', '2025-10-16', '2025-10-19', 3000.00, NULL, 0.00, NULL, 'pending', 0, NULL, 0, NULL, '', NULL, 1, '2025-10-14 18:30:18', '2025-10-14 18:30:18', NULL),
(24, 18, 19, 6, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', '2025-12-07', '2025-12-07', 1800.00, NULL, 0.00, NULL, 'confirmed', 0, NULL, 0, NULL, '', NULL, 1, '2025-11-30 21:36:07', '2025-11-30 21:36:26', '2026-01-18');

--
-- Disparadores `room_reservations`
--
DELIMITER $$
CREATE TRIGGER `trg_notify_new_room_reservation` AFTER INSERT ON `room_reservations` FOR EACH ROW BEGIN
    DECLARE v_hotel_id INT;
    DECLARE v_room_number VARCHAR(20);
    DECLARE v_guest_display_name VARCHAR(255);
    
    -- Get hotel_id and room_number from rooms table
    SELECT hotel_id, room_number INTO v_hotel_id, v_room_number
    FROM rooms
    WHERE id = NEW.room_id;
    
    -- Get guest display name (prefer guest_name from reservation, fallback to user table)
    IF NEW.guest_name IS NOT NULL AND NEW.guest_name != '' THEN
        SET v_guest_display_name = NEW.guest_name;
    ELSEIF NEW.guest_id IS NOT NULL THEN
        SELECT CONCAT(first_name, ' ', last_name) INTO v_guest_display_name
        FROM users
        WHERE id = NEW.guest_id;
    ELSE
        SET v_guest_display_name = 'Huésped';
    END IF;
    
    -- Insert notifications for admin and manager
    INSERT INTO system_notifications (
        hotel_id, 
        user_id, 
        notification_type, 
        related_type, 
        related_id, 
        title, 
        message, 
        requires_sound, 
        priority
    )
    SELECT 
        v_hotel_id,
        u.id,
        'new_reservation_room',
        'room_reservation',
        NEW.id,
        'Nueva Reservación de Habitación',
        CONCAT('Nueva reservación de ', v_guest_display_name, 
               ' para habitación ', v_room_number, 
               ' - Check-in: ', DATE_FORMAT(NEW.check_in, '%d/%m/%Y')),
        1,
        'high'
    FROM users u
    WHERE u.hotel_id = v_hotel_id 
    AND u.role IN ('admin', 'manager')
    AND u.is_active = 1;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_requests`
--

CREATE TABLE `service_requests` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `guest_id` int(11) NOT NULL,
  `assigned_to` int(11) DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `service_type_id` int(11) DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `priority` enum('low','normal','high','urgent') COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `status` enum('pending','assigned','in_progress','completed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `room_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requested_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `service_requests`
--

INSERT INTO `service_requests` (`id`, `hotel_id`, `guest_id`, `assigned_to`, `title`, `service_type_id`, `description`, `priority`, `status`, `room_number`, `requested_at`, `completed_at`) VALUES
(1, 1, 5, 4, 'Toallas adicionales', 1, 'Necesito 2 toallas extra en la habitación', 'normal', 'pending', '202', '2025-10-04 18:02:35', NULL),
(2, 1, 5, NULL, 'Limpieza de habitación', 46, 'Por favor limpiar la habitación 202 a las 2pm', 'normal', 'pending', '202', '2025-10-04 18:02:35', NULL),
(3, 1, 5, 4, 'Servicio desayuno', 106, 'Desayuno continental para 2 personas a las 8am', 'high', 'completed', '202', '2025-10-04 18:02:35', NULL),
(4, 7, 15, NULL, 'Toallas', 8, '3 toallas', 'normal', 'completed', '3', '2025-10-05 16:11:18', NULL),
(5, 7, 15, NULL, 'Alberca', 113, 'clases', 'high', 'pending', '3', '2025-10-05 17:21:11', NULL),
(6, 7, 15, NULL, 'toallas', 8, 'a. ver', 'high', 'pending', '3', '2025-10-05 19:11:58', NULL),
(7, 6, 12, NULL, 'Reservación Casa Blanca y Gemelas', 112, '11-12 de Octubre', 'normal', 'pending', '', '2025-10-10 02:36:47', NULL),
(8, 6, 12, NULL, 'Reservación 13 de Octubre', 112, 'Reservación Gemela', 'normal', 'pending', '', '2025-10-10 02:37:39', NULL),
(9, 6, 12, NULL, 'Reservación Casa Blanca', 112, '24 a 26 de diciembre Casa Blanca', 'normal', 'pending', '', '2025-10-10 02:38:47', NULL),
(10, 6, 12, NULL, 'Reservacion Casa Grande', 112, '31 diciembreb-2 enero', 'normal', 'assigned', '1', '2025-10-10 02:39:26', NULL),
(11, 6, 12, NULL, '', 7, '2 toallas xfa', 'high', 'cancelled', '2', '2025-10-10 19:07:43', NULL),
(12, 6, 12, 12, 'Viaje a Amealco', 97, '', 'urgent', 'pending', '3', '2025-10-10 19:36:36', NULL),
(13, 6, 12, NULL, 'Baño sucio', 52, 'a ver', 'normal', 'pending', '1', '2025-10-12 02:55:31', NULL),
(14, 6, 32, 34, 'blancas', 7, '2', 'normal', 'pending', '2', '2025-10-12 02:57:08', NULL);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `service_type_catalog`
--

CREATE TABLE `service_type_catalog` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `icon` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'bi-wrench',
  `is_active` tinyint(1) DEFAULT '1',
  `sort_order` int(11) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `service_type_catalog`
--

INSERT INTO `service_type_catalog` (`id`, `hotel_id`, `name`, `description`, `icon`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 1, 'Toallas', 'Solicitud de toallas adicionales', 'bi-droplet', 1, 1, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(2, 13, 'Toallas', 'Solicitud de toallas adicionales', 'bi-droplet', 1, 1, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(3, 2, 'Toallas', 'Solicitud de toallas adicionales', 'bi-droplet', 1, 1, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(4, 3, 'Toallas', 'Solicitud de toallas adicionales', 'bi-droplet', 1, 1, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(5, 4, 'Toallas', 'Solicitud de toallas adicionales', 'bi-droplet', 1, 1, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(6, 5, 'Toallas', 'Solicitud de toallas adicionales', 'bi-droplet', 1, 1, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(7, 6, 'Toallas', 'Solicitud de toallas adicionales', 'bi-droplet', 1, 1, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(8, 7, 'Toallas', 'Solicitud de toallas adicionales', 'bi-droplet', 1, 1, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(9, 8, 'Toallas', 'Solicitud de toallas adicionales', 'bi-droplet', 1, 1, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(10, 11, 'Toallas', 'Solicitud de toallas adicionales', 'bi-droplet', 1, 1, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(11, 12, 'Toallas', 'Solicitud de toallas adicionales', 'bi-droplet', 1, 1, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(16, 1, 'Menú / Room Service', 'Solicitud de servicio a la habitación', 'bi-egg-fried', 1, 2, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(17, 13, 'Menú / Room Service', 'Solicitud de servicio a la habitación', 'bi-egg-fried', 1, 2, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(18, 2, 'Menú / Room Service', 'Solicitud de servicio a la habitación', 'bi-egg-fried', 1, 2, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(19, 3, 'Menú / Room Service', 'Solicitud de servicio a la habitación', 'bi-egg-fried', 1, 2, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(20, 4, 'Menú / Room Service', 'Solicitud de servicio a la habitación', 'bi-egg-fried', 1, 2, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(21, 5, 'Menú / Room Service', 'Solicitud de servicio a la habitación', 'bi-egg-fried', 1, 2, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(22, 6, 'Menú / Room Service', 'Solicitud de servicio a la habitación', 'bi-egg-fried', 1, 2, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(23, 7, 'Menú / Room Service', 'Solicitud de servicio a la habitación', 'bi-egg-fried', 1, 2, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(24, 8, 'Menú / Room Service', 'Solicitud de servicio a la habitación', 'bi-egg-fried', 1, 2, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(25, 11, 'Menú / Room Service', 'Solicitud de servicio a la habitación', 'bi-egg-fried', 1, 2, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(26, 12, 'Menú / Room Service', 'Solicitud de servicio a la habitación', 'bi-egg-fried', 1, 2, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(31, 1, 'Conserje', 'Solicitud de asistencia del conserje', 'bi-person-badge', 1, 3, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(32, 13, 'Conserje', 'Solicitud de asistencia del conserje', 'bi-person-badge', 1, 3, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(33, 2, 'Conserje', 'Solicitud de asistencia del conserje', 'bi-person-badge', 1, 3, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(34, 3, 'Conserje', 'Solicitud de asistencia del conserje', 'bi-person-badge', 1, 3, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(35, 4, 'Conserje', 'Solicitud de asistencia del conserje', 'bi-person-badge', 1, 3, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(36, 5, 'Conserje', 'Solicitud de asistencia del conserje', 'bi-person-badge', 1, 3, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(37, 6, 'Conserje', 'Solicitud de asistencia del conserje', 'bi-person-badge', 1, 3, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(38, 7, 'Conserje', 'Solicitud de asistencia del conserje', 'bi-person-badge', 1, 3, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(39, 8, 'Conserje', 'Solicitud de asistencia del conserje', 'bi-person-badge', 1, 3, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(40, 11, 'Conserje', 'Solicitud de asistencia del conserje', 'bi-person-badge', 1, 3, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(41, 12, 'Conserje', 'Solicitud de asistencia del conserje', 'bi-person-badge', 1, 3, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(46, 1, 'Limpieza', 'Solicitud de servicio de limpieza', 'bi-brush', 1, 4, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(47, 13, 'Limpieza', 'Solicitud de servicio de limpieza', 'bi-brush', 1, 4, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(48, 2, 'Limpieza', 'Solicitud de servicio de limpieza', 'bi-brush', 1, 4, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(49, 3, 'Limpieza', 'Solicitud de servicio de limpieza', 'bi-brush', 1, 4, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(50, 4, 'Limpieza', 'Solicitud de servicio de limpieza', 'bi-brush', 1, 4, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(51, 5, 'Limpieza', 'Solicitud de servicio de limpieza', 'bi-brush', 1, 4, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(52, 6, 'Limpieza', 'Solicitud de servicio de limpieza', 'bi-brush', 1, 4, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(53, 7, 'Limpieza', 'Solicitud de servicio de limpieza', 'bi-brush', 1, 4, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(54, 8, 'Limpieza', 'Solicitud de servicio de limpieza', 'bi-brush', 1, 4, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(55, 11, 'Limpieza', 'Solicitud de servicio de limpieza', 'bi-brush', 1, 4, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(56, 12, 'Limpieza', 'Solicitud de servicio de limpieza', 'bi-brush', 1, 4, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(61, 1, 'Mantenimiento', 'Reporte de problema técnico o mantenimiento', 'bi-tools', 1, 5, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(62, 13, 'Mantenimiento', 'Reporte de problema técnico o mantenimiento', 'bi-tools', 1, 5, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(63, 2, 'Mantenimiento', 'Reporte de problema técnico o mantenimiento', 'bi-tools', 1, 5, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(64, 3, 'Mantenimiento', 'Reporte de problema técnico o mantenimiento', 'bi-tools', 1, 5, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(65, 4, 'Mantenimiento', 'Reporte de problema técnico o mantenimiento', 'bi-tools', 1, 5, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(66, 5, 'Mantenimiento', 'Reporte de problema técnico o mantenimiento', 'bi-tools', 1, 5, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(67, 6, 'Mantenimiento', 'Reporte de problema técnico o mantenimiento', 'bi-tools', 1, 5, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(68, 7, 'Mantenimiento', 'Reporte de problema técnico o mantenimiento', 'bi-tools', 1, 5, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(69, 8, 'Mantenimiento', 'Reporte de problema técnico o mantenimiento', 'bi-tools', 1, 5, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(70, 11, 'Mantenimiento', 'Reporte de problema técnico o mantenimiento', 'bi-tools', 1, 5, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(71, 12, 'Mantenimiento', 'Reporte de problema técnico o mantenimiento', 'bi-tools', 1, 5, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(76, 1, 'Amenidades', 'Solicitud relacionada con amenidades del hotel', 'bi-spa', 1, 6, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(77, 13, 'Amenidades', 'Solicitud relacionada con amenidades del hotel', 'bi-spa', 1, 6, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(78, 2, 'Amenidades', 'Solicitud relacionada con amenidades del hotel', 'bi-spa', 1, 6, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(79, 3, 'Amenidades', 'Solicitud relacionada con amenidades del hotel', 'bi-spa', 1, 6, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(80, 4, 'Amenidades', 'Solicitud relacionada con amenidades del hotel', 'bi-spa', 1, 6, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(81, 5, 'Amenidades', 'Solicitud relacionada con amenidades del hotel', 'bi-spa', 1, 6, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(82, 6, 'Amenidades', 'Solicitud relacionada con amenidades del hotel', 'bi-spa', 1, 6, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(83, 7, 'Amenidades', 'Solicitud relacionada con amenidades del hotel', 'bi-spa', 1, 6, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(84, 8, 'Amenidades', 'Solicitud relacionada con amenidades del hotel', 'bi-spa', 1, 6, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(85, 11, 'Amenidades', 'Solicitud relacionada con amenidades del hotel', 'bi-spa', 1, 6, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(86, 12, 'Amenidades', 'Solicitud relacionada con amenidades del hotel', 'bi-spa', 1, 6, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(91, 1, 'Transporte', 'Solicitud de servicio de transporte', 'bi-car-front', 1, 7, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(92, 13, 'Transporte', 'Solicitud de servicio de transporte', 'bi-car-front', 1, 7, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(93, 2, 'Transporte', 'Solicitud de servicio de transporte', 'bi-car-front', 1, 7, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(94, 3, 'Transporte', 'Solicitud de servicio de transporte', 'bi-car-front', 1, 7, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(95, 4, 'Transporte', 'Solicitud de servicio de transporte', 'bi-car-front', 1, 7, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(96, 5, 'Transporte', 'Solicitud de servicio de transporte', 'bi-car-front', 1, 7, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(97, 6, 'Transporte', 'Solicitud de servicio de transporte', 'bi-car-front', 1, 7, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(98, 7, 'Transporte', 'Solicitud de servicio de transporte', 'bi-car-front', 1, 7, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(99, 8, 'Transporte', 'Solicitud de servicio de transporte', 'bi-car-front', 1, 7, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(100, 11, 'Transporte', 'Solicitud de servicio de transporte', 'bi-car-front', 1, 7, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(101, 12, 'Transporte', 'Solicitud de servicio de transporte', 'bi-car-front', 1, 7, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(106, 1, 'Otro', 'Otras solicitudes de servicio', 'bi-question-circle', 1, 99, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(107, 13, 'Otro', 'Otras solicitudes de servicio', 'bi-question-circle', 1, 99, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(108, 2, 'Otro', 'Otras solicitudes de servicio', 'bi-question-circle', 1, 99, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(109, 3, 'Otro', 'Otras solicitudes de servicio', 'bi-question-circle', 1, 99, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(110, 4, 'Otro', 'Otras solicitudes de servicio', 'bi-question-circle', 1, 99, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(111, 5, 'Otro', 'Otras solicitudes de servicio', 'bi-question-circle', 1, 99, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(112, 6, 'Otro', 'Otras solicitudes de servicio', 'bi-question-circle', 1, 99, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(113, 7, 'Otro', 'Otras solicitudes de servicio', 'bi-question-circle', 1, 99, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(114, 8, 'Otro', 'Otras solicitudes de servicio', 'bi-question-circle', 1, 99, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(115, 11, 'Otro', 'Otras solicitudes de servicio', 'bi-question-circle', 1, 99, '2025-10-10 15:52:52', '2025-10-10 15:52:52'),
(116, 12, 'Otro', 'Otras solicitudes de servicio', 'bi-question-circle', 1, 99, '2025-10-10 15:52:52', '2025-10-10 15:52:52');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `shopping_cart`
--

CREATE TABLE `shopping_cart` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `session_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `subscriptions`
--

CREATE TABLE `subscriptions` (
  `id` int(11) NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('trial','monthly','annual') COLLATE utf8mb4_unicode_ci NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `duration_days` int(11) NOT NULL,
  `features` text COLLATE utf8mb4_unicode_ci,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `subscriptions`
--

INSERT INTO `subscriptions` (`id`, `name`, `type`, `price`, `duration_days`, `features`, `description`, `is_active`, `created_at`, `updated_at`) VALUES
(2, 'Plan Mensual', 'monthly', 999.00, 30, 'Acceso completo, hasta 50 habitaciones, soporte prioritario, reportes avanzados\nDescripción: Plan mensual con acceso completo a todas las funcionalidades.', 'Plan mensual con acceso completo a todas las funcionalidades. Perfecto para hoteles pequeños y medianos.', 1, '2025-10-04 18:02:35', '2025-10-14 13:44:21'),
(3, 'Plan Anual', 'annual', 9990.00, 365, 'Acceso completo, habitaciones ilimitadas, soporte 24/7, reportes personalizados, capacitación\nDescripción: Plan anual con descuento. Todas las funcionalidades incluidas más soporte prioritario.', 'Plan anual con descuento. Todas las funcionalidades incluidas más soporte prioritario.', 1, '2025-10-04 18:02:35', '2025-10-14 13:44:25');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `subscription_plans`
--

CREATE TABLE `subscription_plans` (
  `id` int(11) NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `price` decimal(10,2) NOT NULL,
  `billing_cycle` enum('monthly','annual','lifetime') COLLATE utf8mb4_unicode_ci NOT NULL,
  `trial_days` int(11) DEFAULT '0',
  `max_hotels` int(11) DEFAULT '1',
  `max_rooms_per_hotel` int(11) DEFAULT '50',
  `max_tables_per_hotel` int(11) DEFAULT '30',
  `max_staff_per_hotel` int(11) DEFAULT '20',
  `features` json DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `sort_order` int(11) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `subscription_plans`
--

INSERT INTO `subscription_plans` (`id`, `name`, `slug`, `description`, `price`, `billing_cycle`, `trial_days`, `max_hotels`, `max_rooms_per_hotel`, `max_tables_per_hotel`, `max_staff_per_hotel`, `features`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 'Plan Trial - Prueba Gratuita', 'trial', 'Plan de prueba gratuito configurable por Superadmin. Incluye acceso completo con límites básicos.', 0.00, 'monthly', 30, 1, 10, 10, 5, '{\"soporte\": \"Email básico\", \"reportes\": \"Básicos\", \"mesas_max\": 10, \"descripcion\": \"Prueba gratuita con todas las funcionalidades\", \"multi_hotel\": false, \"personal_max\": 5, \"integraciones\": false, \"habitaciones_max\": 10}', 1, 1, '2025-10-04 19:59:09', '2025-10-04 19:59:09'),
(2, 'Plan Mensual - Básico', 'monthly', 'Plan mensual con pago recurrente. Ideal para hoteles pequeños y medianos.', 6990.00, 'monthly', 0, 1, 50, 30, 20, '{\"soporte\": \"Email prioritario\", \"reportes\": \"Avanzados\", \"mesas_max\": 30, \"descripcion\": \"Plan mensual con acceso completo\", \"multi_hotel\": false, \"personal_max\": 20, \"integraciones\": \"Stripe, PayPal\", \"habitaciones_max\": 50, \"notificaciones_sms\": false, \"notificaciones_email\": true}', 1, 2, '2025-10-04 19:59:09', '2025-10-14 19:17:02'),
(3, 'Plan Anual - 2 hoteles', 'annual', 'Plan anual con descuento significativo. Pago único anual con todas las funcionalidades premium.', 69900.00, 'annual', 0, 3, 150, 80, 50, '{\"soporte\": \"24/7 prioritario\", \"reportes\": \"Personalizados y exportables\", \"mesas_max\": 80, \"descripcion\": \"Plan anual con máximo ahorro\", \"multi_hotel\": true, \"capacitacion\": true, \"personal_max\": 50, \"integraciones\": \"Stripe, PayPal, MercadoPago\", \"descuento_anual\": \"16% vs mensual\", \"habitaciones_max\": 150, \"notificaciones_sms\": true, \"notificaciones_email\": true}', 1, 3, '2025-10-04 19:59:09', '2025-10-14 19:17:10'),
(4, 'Plan Enterprise - 10 Hoteles', 'enterprise', 'Plan corporativo sin límites. Para cadenas hoteleras grandes con necesidades especiales.', 129900.00, 'annual', 0, 999, 999, 999, 999, '{\"soporte\": \"Dedicado 24/7 con gestor de cuenta\", \"reportes\": \"Personalizados con BI\", \"mesas_max\": \"ilimitadas\", \"api_acceso\": true, \"descripcion\": \"Plan corporativo sin límites\", \"multi_hotel\": true, \"white_label\": true, \"capacitacion\": \"Ilimitada\", \"personal_max\": \"ilimitado\", \"customizacion\": true, \"integraciones\": \"Todas las pasarelas disponibles\", \"habitaciones_max\": \"ilimitadas\", \"notificaciones_sms\": true, \"notificaciones_push\": true, \"notificaciones_email\": true}', 1, 4, '2025-10-04 19:59:09', '2025-10-14 19:16:34');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `system_notifications`
--

CREATE TABLE `system_notifications` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL COMMENT 'Usuario destinatario',
  `notification_type` enum('new_reservation_room','new_reservation_table','service_request','amenity_request','dish_order','general') COLLATE utf8mb4_unicode_ci NOT NULL,
  `related_type` enum('room_reservation','table_reservation','service_request','amenity','order') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_id` int(11) DEFAULT NULL COMMENT 'ID del registro relacionado',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `is_read` tinyint(1) DEFAULT '0',
  `requires_sound` tinyint(1) DEFAULT '1' COMMENT 'Si debe reproducir sonido',
  `priority` enum('low','normal','high','urgent') COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `system_notifications`
--

INSERT INTO `system_notifications` (`id`, `hotel_id`, `user_id`, `notification_type`, `related_type`, `related_id`, `title`, `message`, `is_read`, `requires_sound`, `priority`, `read_at`, `created_at`) VALUES
(11, 7, 14, 'new_reservation_room', 'room_reservation', 3, 'Nueva Reservación de Habitación', 'Nueva reservación para habitación 2 - Check-in: 05/10/2025', 1, 1, 'high', '2025-10-07 00:35:11', '2025-10-05 20:11:35'),
(12, 7, 14, 'new_reservation_table', 'table_reservation', 5, 'Nueva Reservación de Mesa', 'Nueva reservación para mesa 4 - Fecha: 05/10/2025 19:00', 1, 1, 'high', '2025-10-07 00:35:10', '2025-10-05 20:11:58'),
(13, 7, 16, 'new_reservation_table', 'table_reservation', 5, 'Nueva Reservación de Mesa', 'Nueva reservación para mesa 4 - Fecha: 05/10/2025 19:00', 0, 1, 'high', NULL, '2025-10-05 20:11:58'),
(15, 7, 14, 'amenity_request', '', 4, 'Nueva Reservación de Amenidad', 'Reservación de Caballerizas para Dan Raso el 05/10/2025 a las 10:00', 1, 1, 'high', '2025-10-07 00:35:10', '2025-10-05 20:12:37'),
(16, 8, 17, 'new_reservation_room', 'room_reservation', 4, 'Nueva Reservación de Habitación', 'Nueva reservación para habitación 1 - Check-in: 05/10/2025', 1, 1, 'high', '2025-10-05 22:05:51', '2025-10-05 20:33:21'),
(17, 8, 17, 'new_reservation_table', 'table_reservation', 6, 'Nueva Reservación de Mesa', 'Nueva reservación para mesa 1 - Fecha: 05/10/2025 19:00', 1, 1, 'high', '2025-10-05 22:05:51', '2025-10-05 20:33:42'),
(18, 8, 17, 'amenity_request', '', 5, 'Nueva Reservación de Amenidad', 'Reservación de Pesca para Dan Raso el 05/10/2025 a las 10:00', 1, 1, 'high', '2025-10-05 20:54:53', '2025-10-05 20:34:11'),
(19, 8, 17, 'amenity_request', '', 6, 'Nueva Reservación de Amenidad', 'Reservación de Pesca para Jonathan Raso el 12/10/2025 a las 15:00', 1, 1, 'high', '2025-10-05 22:05:51', '2025-10-05 21:41:51'),
(20, 8, 17, 'amenity_request', '', 7, 'Nueva Reservación de Amenidad', 'Reservación de Pesca para Dan Raso el 05/10/2025 a las 16:00', 1, 1, 'high', '2025-10-05 22:05:51', '2025-10-05 21:42:15'),
(21, 8, 17, 'new_reservation_table', 'table_reservation', 7, 'Nueva Reservación de Mesa', 'Nueva reservación para mesa 1 - Fecha: 18/10/2025 20:00', 1, 1, 'high', '2025-10-05 22:05:51', '2025-10-05 21:47:45'),
(22, 8, 17, 'amenity_request', '', 8, 'Nueva Reservación de Amenidad', 'Reservación de Pesca para Sanchez Jimenez el 05/10/2025 a las 08:00', 1, 1, 'high', '2025-10-05 21:50:04', '2025-10-05 21:48:37'),
(23, 8, 17, 'amenity_request', '', 9, 'Nueva Reservación de Amenidad', 'Reservación de Parrillada Familiar para Luisa Hae el 05/10/2025 a las 15:00', 1, 1, 'high', '2025-10-05 22:05:51', '2025-10-05 21:54:25'),
(24, 8, 17, 'new_reservation_table', 'table_reservation', 8, 'Nueva Reservación de Mesa', 'Nueva reservación para mesa 1 - Fecha: 08/10/2025 13:00', 1, 1, 'high', '2025-10-05 22:05:49', '2025-10-05 21:59:57'),
(25, 8, 17, 'new_reservation_table', 'table_reservation', 9, 'Nueva Reservación de Mesa', 'Nueva reservación para mesa 1 - Fecha: 07/10/2025 12:00', 1, 1, 'high', '2025-10-05 22:05:49', '2025-10-05 22:01:50'),
(26, 8, 17, 'new_reservation_room', 'room_reservation', 5, 'Nueva Reservación de Habitación', 'Nueva reservación de Dan Raso para habitación 2 - Check-in: 05/10/2025', 0, 1, 'high', NULL, '2025-10-05 22:43:03'),
(27, 8, 17, 'new_reservation_table', 'table_reservation', 10, 'Nueva Reservación de Mesa', 'Nueva reservación de Dan Raso para mesa M1 - Fecha: 12/10/2025 13:00', 0, 1, 'high', NULL, '2025-10-05 22:43:33'),
(28, 8, 17, 'amenity_request', '', 10, 'Nueva Reservación de Amenidad', 'Reservación de Parrillada Familiar para Dan Raso el 08/10/2025 a las 15:00', 0, 1, 'high', NULL, '2025-10-05 22:43:56'),
(29, 6, 12, 'new_reservation_room', 'room_reservation', 6, 'Nueva Reservación de Habitación', 'Nueva reservación de Dan Raso para habitación Casa Blanca - Check-in: 11/10/2025', 1, 1, 'high', '2025-10-06 03:08:56', '2025-10-06 00:42:18'),
(30, 6, 12, 'amenity_request', '', 11, 'Nueva Reservación de Amenidad', 'Reservación de Monta de Caballo para Dan Raso el 26/10/2025 a las 13:00', 1, 1, 'high', '2025-10-06 03:08:56', '2025-10-06 00:42:52'),
(31, 6, 12, 'new_reservation_room', 'room_reservation', 7, 'Nueva Reservación de Habitación', 'Nueva reservación de Dan Raso para habitación Gemelita 1 - Check-in: 15/10/2025', 1, 1, 'high', '2025-10-06 17:39:52', '2025-10-06 05:25:01'),
(32, 6, 12, 'amenity_request', '', 12, 'Nueva Reservación de Amenidad', 'Reservación de Pesca para Dan Raso el 16/10/2025 a las 12:00', 1, 1, 'high', '2025-10-06 05:29:53', '2025-10-06 05:25:31'),
(33, 6, 12, 'amenity_request', '', 13, 'Nueva Reservación de Amenidad', 'Reservación de Pesca para Dan Raso el 16/10/2025 a las 12:00', 1, 1, 'high', '2025-10-06 17:39:52', '2025-10-06 05:25:31'),
(34, 6, 12, 'new_reservation_table', 'table_reservation', 11, 'Nueva Reservación de Mesa', 'Nueva reservación de Luisa Hae para mesa S1 - Fecha: 14/10/2025 12:30', 1, 1, 'high', '2025-10-06 17:39:52', '2025-10-06 05:26:07'),
(35, 6, 12, 'amenity_request', '', 14, 'Nueva Reservación de Amenidad', 'Reservación de Pesca para Jonathan Raso el 12/10/2025 a las 12:00', 1, 1, 'high', '2025-10-06 17:39:52', '2025-10-06 05:30:50'),
(36, 6, 12, 'amenity_request', '', 15, 'Nueva Reservación de Amenidad', 'Reservación de Pesca para Miguel Cervantes el 16/10/2025 a las 12:00', 1, 1, 'high', '2025-10-06 17:39:52', '2025-10-06 05:31:45'),
(37, 6, 12, 'amenity_request', '', 16, 'Nueva Reservación de Amenidad', 'Reservación de Monta de Caballo para Dan Raso el 19/10/2025 a las 12:00', 1, 1, 'high', '2025-10-06 17:39:52', '2025-10-06 06:41:29'),
(38, 6, 12, 'new_reservation_room', 'room_reservation', 8, 'Nueva Reservación de Habitación', 'Nueva reservación de Graciela Rios para habitación Gemelita 2 - Check-in: 16/10/2025', 1, 1, 'high', '2025-10-06 17:39:52', '2025-10-06 15:27:00'),
(39, 6, 12, 'new_reservation_room', 'room_reservation', 9, 'Nueva Reservación de Habitación', 'Nueva reservación de Luisa Hae para habitación Gemelita 2 - Check-in: 12/10/2025', 1, 1, 'high', '2025-10-06 17:39:52', '2025-10-06 15:47:56'),
(40, 6, 12, 'new_reservation_table', 'table_reservation', 12, 'Nueva Reservación de Mesa', 'Nueva reservación de Dan Raso para mesa S1 - Fecha: 26/10/2025 13:45', 1, 1, 'high', '2025-10-06 17:39:52', '2025-10-06 16:33:30'),
(41, 6, 12, 'amenity_request', '', 17, 'Nueva Reservación de Amenidad', 'Reservación de Monta de Caballo para Miguel Cervantes el 05/10/2025 a las 15:56', 1, 1, 'high', '2025-10-06 17:39:49', '2025-10-06 16:33:51'),
(42, 6, 12, 'new_reservation_room', 'room_reservation', 10, 'Nueva Reservación de Habitación', 'Nueva reservación de Miguel Cervantes para habitación Gemelita 1 - Check-in: 12/10/2025', 1, 1, 'high', '2025-10-06 17:39:52', '2025-10-06 16:34:11'),
(43, 6, 12, 'amenity_request', '', 18, 'Nueva Reservación de Amenidad', 'Reservación de Paseo por el bosque para Roberto Palazuelos el 12/10/2025 a las 13:45', 1, 1, 'high', '2025-10-06 17:39:50', '2025-10-06 17:29:46'),
(44, 6, 12, 'new_reservation_room', 'room_reservation', 11, 'Nueva Reservación de Habitación', 'Nueva reservación de Kenia Jimenez para habitación Gemelita 1 - Check-in: 10/10/2025', 1, 1, 'high', '2025-10-06 17:39:50', '2025-10-06 17:31:49'),
(45, 6, 12, 'new_reservation_room', 'room_reservation', 12, 'Nueva Reservación de Habitación', 'Nueva reservación de Andres Perez para habitación Casa Blanca - Check-in: 09/10/2025', 1, 1, 'high', '2025-10-07 18:48:57', '2025-10-07 18:48:48'),
(46, 6, 12, 'new_reservation_room', 'room_reservation', 13, 'Nueva Reservación de Habitación', 'Nueva reservación de Roberto Ejemplo para habitación Gemelita 2 - Check-in: 13/10/2025', 0, 1, 'high', NULL, '2025-10-10 15:56:45'),
(47, 6, 12, 'new_reservation_room', 'room_reservation', 14, 'Nueva Reservación de Habitación', 'Nueva reservación de Roberto Ejemplo para habitación Gemelita 2 - Check-in: 12/10/2025', 0, 1, 'high', NULL, '2025-10-10 17:04:24'),
(48, 6, 12, 'new_reservation_room', 'room_reservation', 15, 'Nueva Reservación de Habitación', 'Nueva reservación de Roberto Ejemplo para habitación Gemelita 2 - Check-in: 01/01/2099', 0, 1, 'high', NULL, '2025-10-10 18:17:22'),
(49, 6, 12, 'new_reservation_room', 'room_reservation', 16, 'Nueva Reservación de Habitación', 'Nueva reservación de Roberto Ejemplo para habitación Gemelita 2 - Check-in: 01/01/2099', 0, 1, 'high', NULL, '2025-10-10 18:18:22'),
(50, 6, 12, 'new_reservation_room', 'room_reservation', 17, 'Nueva Reservación de Habitación', 'Nueva reservación de Roberto Ejemplo para habitación Gemelita 1 - Check-in: 12/10/2025', 0, 1, 'high', NULL, '2025-10-10 19:35:22'),
(51, 6, 12, 'new_reservation_room', 'room_reservation', 18, 'Nueva Reservación de Habitación', 'Nueva reservación de Dan Raso para habitación Casa Blanca - Check-in: 15/10/2025', 0, 1, 'high', NULL, '2025-10-10 19:40:20'),
(52, 6, 12, 'new_reservation_room', 'room_reservation', 19, 'Nueva Reservación de Habitación', 'Nueva reservación de Roberto Ejemplo para habitación Casa Blanca - Check-in: 00/00/0000', 0, 1, 'high', NULL, '2025-10-10 20:15:56'),
(53, 6, 12, 'new_reservation_room', 'room_reservation', 20, 'Nueva Reservación de Habitación', 'Nueva reservación de Roberto Ejemplo para habitación Casa Blanca - Check-in: 00/00/0000', 0, 1, 'high', NULL, '2025-10-10 20:57:50'),
(54, 6, 12, 'amenity_request', '', 19, 'Nueva Reservación de Amenidad', 'Reservación de Pesca para Roberto Ejemplo el 01/01/2099 a las 00:00', 0, 1, 'high', NULL, '2025-10-10 20:58:42'),
(55, 6, 12, 'amenity_request', '', 20, 'Nueva Reservación de Amenidad', 'Reservación de Temazcal para Roberto Ejemplo el 01/01/2099 a las 00:00', 0, 1, 'high', NULL, '2025-10-10 21:37:12'),
(56, 6, 12, 'amenity_request', '', 21, 'Nueva Reservación de Amenidad', 'Reservación de cuatrimoto para Roberto Ejemplo el 01/01/2099 a las 00:00', 0, 1, 'high', NULL, '2025-10-10 21:38:08'),
(57, 6, 12, 'new_reservation_room', 'room_reservation', 21, 'Nueva Reservación de Habitación', 'Nueva reservación de Dan Raso para habitación Casa Blanca - Check-in: 00/00/0000', 1, 1, 'high', '2025-10-10 21:46:00', '2025-10-10 21:44:16'),
(58, 6, 12, 'new_reservation_table', 'table_reservation', 13, 'Nueva Reservación de Mesa', 'Nueva reservación de Dan Raso para mesa S1 - Fecha: 13/10/2025 15:00', 0, 1, 'high', NULL, '2025-10-13 21:03:25'),
(59, 6, 32, 'new_reservation_table', 'table_reservation', 13, 'Nueva Reservación de Mesa', 'Nueva reservación de Dan Raso para mesa S1 - Fecha: 13/10/2025 15:00', 0, 1, 'high', NULL, '2025-10-13 21:03:25'),
(60, 6, 34, 'new_reservation_table', 'table_reservation', 13, 'Nueva Reservación de Mesa', 'Nueva reservación de Dan Raso para mesa S1 - Fecha: 13/10/2025 15:00', 0, 1, 'high', NULL, '2025-10-13 21:03:25'),
(61, 6, 12, 'amenity_request', '', 22, 'Nueva Reservación de Amenidad', 'Reservación de Cuatrimoto para Andres Raso Perez el 19/10/2025 a las 12:30', 0, 1, 'high', NULL, '2025-10-13 21:05:18'),
(62, 6, 12, 'new_reservation_room', 'room_reservation', 22, 'Nueva Reservación de Habitación', 'Nueva reservación de Dan Raso para habitación Gemelita 1 - Check-in: 16/10/2025', 0, 1, 'high', NULL, '2025-10-14 18:30:18'),
(63, 6, 12, 'new_reservation_room', 'room_reservation', 23, 'Nueva Reservación de Habitación', 'Nueva reservación de Dan Raso para habitación Gemelita 2 - Check-in: 16/10/2025', 0, 1, 'high', NULL, '2025-10-14 18:30:18'),
(64, 18, 39, 'new_reservation_room', 'room_reservation', 24, 'Nueva Reservación de Habitación', 'Nueva reservación de Dan Raso para habitación 101 - Check-in: 07/12/2025', 0, 1, 'high', NULL, '2025-11-30 21:36:07');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `table_reservations`
--

CREATE TABLE `table_reservations` (
  `id` int(11) NOT NULL,
  `hotel_id` int(11) NOT NULL,
  `table_id` int(11) NOT NULL,
  `guest_id` int(11) DEFAULT NULL,
  `guest_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `guest_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `guest_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reservation_date` date NOT NULL,
  `reservation_time` time NOT NULL,
  `party_size` int(11) NOT NULL,
  `status` enum('pending','confirmed','seated','completed','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `notification_sent` tinyint(1) DEFAULT '0',
  `confirmation_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email_confirmed` tinyint(1) DEFAULT '0',
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `special_requests` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `guest_birthday` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `table_reservations`
--

INSERT INTO `table_reservations` (`id`, `hotel_id`, `table_id`, `guest_id`, `guest_name`, `guest_email`, `guest_phone`, `reservation_date`, `reservation_time`, `party_size`, `status`, `notification_sent`, `confirmation_code`, `email_confirmed`, `confirmed_at`, `notes`, `special_requests`, `created_at`, `updated_at`, `guest_birthday`) VALUES
(1, 1, 5, 5, NULL, NULL, NULL, '2025-10-04', '20:00:00', 2, 'confirmed', 1, NULL, 0, NULL, 'Aniversario de bodas', NULL, '2025-10-04 18:02:35', '2025-10-05 19:49:39', NULL),
(5, 7, 13, NULL, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', '2025-10-05', '19:00:00', 2, 'cancelled', 0, NULL, 0, NULL, '', NULL, '2025-10-05 20:11:58', '2025-10-07 00:35:07', NULL),
(6, 8, 17, NULL, 'Dan Raso', 'webmaster@impactosdigitales.com', '4425986318', '2025-10-05', '19:00:00', 2, 'seated', 0, NULL, 0, NULL, '', NULL, '2025-10-05 20:33:42', '2025-10-05 20:56:04', NULL),
(7, 8, 17, 19, 'Miguel Cervantes', 'miguel@id.com', '8271358122', '2025-10-18', '20:00:00', 4, 'pending', 0, NULL, 0, NULL, 'Habitación: 3. ', NULL, '2025-10-05 21:47:45', '2025-10-05 21:47:45', NULL),
(8, 8, 17, 21, 'Luisa Hae', 'luisa@id.com', '2183629869', '2025-10-08', '13:00:00', 5, 'confirmed', 0, NULL, 0, NULL, 'Habitación: 4. quiero todo', NULL, '2025-10-05 21:59:57', '2025-10-05 22:05:09', NULL),
(9, 8, 17, 21, 'Luisa Hae', 'luisa@id.com', '0972986875', '2025-10-07', '12:00:00', 2, 'confirmed', 0, NULL, 0, NULL, 'Habitación: 3. ', NULL, '2025-10-05 22:01:50', '2025-10-05 23:34:21', NULL),
(10, 8, 17, 6, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', '2025-10-12', '13:00:00', 2, 'pending', 0, NULL, 0, NULL, 'Habitación: 1. ', NULL, '2025-10-05 22:43:33', '2025-10-05 22:43:33', NULL),
(11, 6, 18, 20, 'Luisa Hae', 'eva@impactosdigitales.com', '9720973129', '2025-10-14', '12:30:00', 2, 'seated', 0, NULL, 0, NULL, 'VISITA.', NULL, '2025-10-06 05:26:07', '2025-10-06 06:44:04', NULL),
(12, 6, 18, 6, 'Dan Raso', 'dan@impactosdigitales.com', '4425986318', '2025-10-26', '13:45:00', 2, 'completed', 0, NULL, 0, NULL, 'VISITA.', NULL, '2025-10-06 16:33:30', '2025-10-07 05:30:59', NULL),
(13, 6, 18, 27, 'Dan Raso', 'oscarbarry16@gmail.com', '4424865390', '2025-10-13', '15:00:00', 2, 'confirmed', 0, NULL, 0, NULL, '', NULL, '2025-10-13 21:03:25', '2025-10-13 21:06:00', '1979-09-21');

--
-- Disparadores `table_reservations`
--
DELIMITER $$
CREATE TRIGGER `trg_block_table_on_confirm` AFTER UPDATE ON `table_reservations` FOR EACH ROW BEGIN
    -- If status changed to confirmed, create a 2-hour block
    IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
        -- Calculate end time (2 hours after reservation time)
        SET @end_time = ADDTIME(NEW.reservation_time, '02:00:00');
        
        -- Insert block record if not already exists
        INSERT IGNORE INTO resource_blocks (
            resource_type,
            resource_id,
            blocked_by,
            reason,
            start_date,
            end_date,
            status
        ) VALUES (
            'table',
            NEW.table_id,
            COALESCE(NEW.guest_id, 1), -- Use guest_id or system user
            CONCAT('Reservación confirmada - ', NEW.guest_name),
            TIMESTAMP(NEW.reservation_date, NEW.reservation_time),
            TIMESTAMP(NEW.reservation_date, @end_time),
            'active'
        );
    END IF;
END
$$
DELIMITER ;
DELIMITER $$
CREATE TRIGGER `trg_notify_new_table_reservation` AFTER INSERT ON `table_reservations` FOR EACH ROW BEGIN
    DECLARE v_hotel_id INT;
    DECLARE v_table_number VARCHAR(20);
    DECLARE v_guest_display_name VARCHAR(255);
    
    -- Get hotel_id and table_number from restaurant_tables
    SELECT hotel_id, table_number INTO v_hotel_id, v_table_number
    FROM restaurant_tables
    WHERE id = NEW.table_id;
    
    -- Get guest display name (prefer guest_name from reservation, fallback to user table)
    IF NEW.guest_name IS NOT NULL AND NEW.guest_name != '' THEN
        SET v_guest_display_name = NEW.guest_name;
    ELSEIF NEW.guest_id IS NOT NULL THEN
        SELECT CONCAT(first_name, ' ', last_name) INTO v_guest_display_name
        FROM users
        WHERE id = NEW.guest_id;
    ELSE
        SET v_guest_display_name = 'Huésped';
    END IF;
    
    -- Insert notifications for admin, manager and hostess
    INSERT INTO system_notifications (
        hotel_id, 
        user_id, 
        notification_type, 
        related_type, 
        related_id, 
        title, 
        message, 
        requires_sound, 
        priority
    )
    SELECT 
        v_hotel_id,
        u.id,
        'new_reservation_table',
        'table_reservation',
        NEW.id,
        'Nueva Reservación de Mesa',
        CONCAT('Nueva reservación de ', v_guest_display_name,
               ' para mesa ', v_table_number, 
               ' - Fecha: ', DATE_FORMAT(NEW.reservation_date, '%d/%m/%Y'), 
               ' ', TIME_FORMAT(NEW.reservation_time, '%H:%i')),
        1,
        'high'
    FROM users u
    WHERE u.hotel_id = v_hotel_id 
    AND u.role IN ('admin', 'manager', 'hostess')
    AND u.is_active = 1;
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timezone` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'America/Mexico_City',
  `language` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'es',
  `last_login` timestamp NULL DEFAULT NULL,
  `role` enum('superadmin','admin','manager','hostess','collaborator','guest') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'guest',
  `hotel_id` int(11) DEFAULT NULL,
  `subscription_id` int(11) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `users`
--

INSERT INTO `users` (`id`, `email`, `password`, `first_name`, `last_name`, `phone`, `avatar`, `timezone`, `language`, `last_login`, `role`, `hotel_id`, `subscription_id`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 'admin@hotelparadise.com', '$2y$12$.07RvSqaBFNGG2Mh2o7PHuzC25KFAfo2eRm2DmOr7hzfcGQbyGBsS', 'Carlos', 'Administrador', '+52 998 111 1111', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 1, 1, 1, '2025-10-04 18:02:35', '2025-10-05 00:14:22'),
(2, 'manager@hotelparadise.com', '$2y$10$GZkOls6kp6W3TZPeShslEebo6jWFysvY5oeGuvf3TCYPr7nyZT2P2', 'María', 'Gerente', '+52 998 222 2222', NULL, 'America/Mexico_City', 'es', NULL, 'manager', 1, NULL, 1, '2025-10-04 18:02:35', '2025-10-04 19:29:07'),
(3, 'hostess@hotelparadise.com', '$2y$12$LQv3c1yycULr6hXVmn2vI.hl7Q8rVQ8rVQ8rVQ8rVQ8rVQ8rVQ8ru', 'Ana', 'Hostess', '+52 998 333 3333', NULL, 'America/Mexico_City', 'es', NULL, 'hostess', 1, NULL, 1, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(4, 'colaborador@hotelparadise.com', '$2y$12$LQv3c1yycULr6hXVmn2vI.hl7Q8rVQ8rVQ8rVQ8rVQ8rVQ8rVQ8ru', 'Juan', 'Colaborador', '+52 998 444 4444', NULL, 'America/Mexico_City', 'es', NULL, 'collaborator', 1, NULL, 1, '2025-10-04 18:02:35', '2025-10-04 18:02:35'),
(5, 'roberto@example.com', '$2y$12$LQv3c1yycULr6hXVmn2vI.hl7Q8rVQ8rVQ8rVQ8rVQ8rVQ8rVQ8ru', 'Roberto', 'Ejemplo', '+52 4427869806', NULL, 'America/Mexico_City', 'es', NULL, 'guest', 1, NULL, 1, '2025-10-04 18:02:35', '2025-10-09 17:36:24'),
(6, 'dan@impactosdigitales.com', '$2y$12$d.645qjwg3i0jNYVR11xIOBw.WE7ck46jlshwigYp7Ycr25G1mQJq', 'Dan', 'Raso', '4425986318', NULL, 'America/Mexico_City', 'es', NULL, 'guest', NULL, 1, 1, '2025-10-04 18:10:59', '2025-10-04 18:10:59'),
(7, 'superadmin@mayorbot.com', '$2y$10$Ht7lH82J8HEdZ7Uw.n4JPOBb2ZIj3YZCL.HWssjI9F2XSHEMfppCS', 'Super', 'Administrador', '+52 999 999 9999', NULL, 'America/Mexico_City', 'es', NULL, 'superadmin', NULL, NULL, 1, '2025-10-04 19:59:09', '2025-10-04 20:00:35'),
(8, 'nath@domunhotel.com', '$2y$12$Cv3xN//9BeTNZmKPZEFD1OO6DnXAJ3/ylQgkACIpeDdzhOFyb6GWa', 'Nath', 'Justo', '4425986320', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 2, 3, 1, '2025-10-04 20:08:52', '2025-10-04 20:08:52'),
(9, 'belendiaz@mayorbot.com', '$2y$12$Qs8ckxyp2zvruY4XZFb9Zu0qZXZGEUUKtrxL5G2Fp.4fsiafxFQ/e', 'Belen', 'Diaz', '4421482001', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 3, 2, 1, '2025-10-04 22:11:48', '2025-10-04 22:11:48'),
(10, 'santiago@restaurante.com', '$2y$12$SyIypvad3783IuIraOGWmelNdnlMqSwcogyFE4ahJIR.m0Z6cZqQ2', 'Dan', 'Raso', '786832169', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 4, 3, 1, '2025-10-04 23:26:27', '2025-10-07 20:28:44'),
(11, 'aldo@hotelamealco.com', '$2y$12$jvmlvm1c2LwHZiDon1DtiedA5/Z591NZMjENhspa7dMRY8po.tNVe', 'Aldo', 'Rosales', '28778123817', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 5, 2, 1, '2025-10-04 23:32:20', '2025-10-04 23:32:20'),
(12, 'admin@ranchoparaisoreal.com', '$2y$12$iegiKNfO.JcvJaF2Lu6XFOBOxcpkrSlgWtcvrcxOr4Wb4TxGmPyES', 'Procuro Real', 'Mancilla', '4462991900', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 6, 3, 1, '2025-10-05 00:39:39', '2025-10-05 23:27:20'),
(13, 'luismorantes@hotelparadise.com', '$2y$12$.ebphjRkT.j3QWPDcbl4A.nM3o53g1/tpVD4jfrtXzHB1dsvKJNR.', 'Luis', 'Morantes', '8912978123', NULL, 'America/Mexico_City', 'es', NULL, 'guest', 1, NULL, 1, '2025-10-05 04:04:50', '2025-10-05 04:04:50'),
(14, 'vale@hotelparadise.com', '$2y$12$fUrcq0KFXp3Z7BhiB9tgSeqRJ29Mikrp4Mfhi5.RYw6arxJ/p0BR6', 'Valeria', 'Rodriguez', '44611764010', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 7, 2, 1, '2025-10-05 16:06:03', '2025-10-05 16:06:03'),
(15, 'dante@hotelparadise.com', '$2y$12$xEjARwWmVvUMiKGBfKrYMuoZr4z8BIOTGLA0RdaWy7/t9W4pBjKgq', 'Dante Orizaba', 'Juo', '4425986322', NULL, 'America/Mexico_City', 'es', NULL, 'guest', 7, NULL, 1, '2025-10-05 16:10:41', '2025-10-05 16:10:41'),
(16, 'kenia@hotelparadise.com', '$2y$12$EWHuLgr7iGb3OtB5Fa5gUujtrtg4WXZd.mFBf7AjLh9iSDaSPiHd.', 'Kenia Sanchez', 'Lopez', '4421482025', NULL, 'America/Mexico_City', 'es', NULL, 'hostess', 7, NULL, 1, '2025-10-05 17:23:13', '2025-10-05 17:23:13'),
(17, 'alejandro@impactosdigitales.com', '$2y$12$2GxD/X5iNJwD8TbY90tSw.au92nSBTq0CHsDAF08ciAZi7Kx8kKhG', 'Ian', 'Raso', '4422044182', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 8, 3, 1, '2025-10-05 20:21:15', '2025-10-05 20:21:15'),
(18, 'facturacion@impactosdigitales.com', '$2y$12$mRT7J949qih6cvOO9IY9EeIXN0vf2fwJhtGhnAIilRhrPx4/YR5ta', 'Jonathan', 'Raso', '4424865389', NULL, 'America/Mexico_City', 'es', NULL, 'guest', 8, NULL, 1, '2025-10-05 21:41:51', '2025-10-05 21:41:51'),
(19, 'miguel@id.com', '$2y$12$2n2vNmxLyHC3jMGP9RLFq.VRw0/XutV69plUjk.KtLY6KIEbXkOym', 'Miguel', 'Cervantes', '8271358122', NULL, 'America/Mexico_City', 'es', NULL, 'guest', 8, NULL, 1, '2025-10-05 21:47:45', '2025-10-05 21:47:45'),
(20, 'san@id.com', '$2y$12$Iv7470iOVc1pLiLg2myjxex7uo.mUnYg.mxap34Lp1Rq7X83zFXKW', 'Sanchez', 'Jimenez', '9720973129', NULL, 'America/Mexico_City', 'es', NULL, 'guest', 8, NULL, 1, '2025-10-05 21:48:37', '2025-10-05 21:48:37'),
(21, 'luisa@id.com', '$2y$12$MIkivdhauK.UZiMStBOzIOEnfmaQvZ0hzitFPT3xh2OXDhl5vWFdq', 'Luisa', 'Hae', '2183629869', NULL, 'America/Mexico_City', 'es', NULL, 'guest', 8, NULL, 1, '2025-10-05 21:54:25', '2025-10-05 21:54:25'),
(24, 'caballeria@ranchoparaisoreal.com', '$2y$12$UzP.gRzgBI2loCnNj8pO2.AM5oBLyHtBEfMhUWZqH/CtZcRmIAzeq', 'Hotel', 'Caballeria', '3892698197', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 11, 3, 1, '2025-10-05 23:23:04', '2025-10-05 23:23:04'),
(25, 'amealcorancho@ranchoparaisoreal.com', '$2y$12$M4y.2bFHfqnSYgwWIAv4DupSr.9vgmjvbSIgXWePkROjOXavAOCLW', 'Rancho', 'Amealco', '2897903038', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 12, 3, 1, '2025-10-05 23:24:25', '2025-10-05 23:24:25'),
(26, 'michoacan@ranchoparaisoreal.com', '$2y$12$qSElJnLmXv.jxpeRu90zBOUg8TjV5tRaAPQSSNMxYhqbKHLQsxcVK', 'Cabañas', 'Michocacan', '8326198289', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 13, 4, 0, '2025-10-05 23:25:30', '2025-10-05 23:58:46'),
(27, 'oscarbarry16@gmail.com', '$2y$12$CSvlYdClRg64CW1VKff.kufSprANnRTPnAp1zUFtdurlg.fx33N86', 'Dan', 'Raso', '4424865390', NULL, 'America/Mexico_City', 'es', NULL, 'guest', 6, NULL, 1, '2025-10-06 06:41:29', '2025-10-06 06:41:29'),
(28, 'chelitario@hotmail.com', '$2y$12$DrvKAYYDoTafEGzyJ/SYo.RkPrLVhv.pB5aU5soEIQaNcu1Uwz0LG', 'Graciela', 'Rios', '3247907049', NULL, 'America/Mexico_City', 'es', NULL, 'guest', 6, NULL, 1, '2025-10-06 15:27:00', '2025-10-06 15:27:00'),
(29, 'roberto@id.com', '$2y$12$wE8NhHoauJjAOvpYSPNXmeEcCP7v65jKT865Nb59z79uJ/QiwUC1G', 'Roberto', 'Palazuelos', '9297980813', NULL, 'America/Mexico_City', 'es', NULL, 'guest', 6, NULL, 1, '2025-10-06 17:29:46', '2025-10-06 17:29:46'),
(30, 'keniakim@id.com', '$2y$12$5QDRbBVzkLS.sb2dWX7l4.mrWpKMpZUl0m7RA23myAKbyt.YO4xai', 'Kenia', 'Jimenez', '2198273197', NULL, 'America/Mexico_City', 'es', NULL, 'guest', 6, NULL, 1, '2025-10-06 17:31:49', '2025-10-06 17:31:49'),
(31, 'hill@hotelparadise.com', '$2y$12$rRa.fx1xRQX22FgF1e1eF.BYWfIgbxWJ3rU99Yi2.EYtlMQnMSp/a', 'Hillary', 'Clinton', '0932001909', NULL, 'America/Mexico_City', 'es', NULL, 'collaborator', 7, NULL, 1, '2025-10-07 00:38:27', '2025-10-07 00:38:27'),
(32, 'lupita@ranchoparaisoreal.com', '$2y$12$CWCEQd1pveUZkMBizXFVbOtb53CHG3GnVT0HsFfOlm5HgG6zyqilG', 'Lupita', 'Bravo', '1293790327', NULL, 'America/Mexico_City', 'es', NULL, 'hostess', 6, NULL, 1, '2025-10-07 05:34:32', '2025-10-07 05:34:32'),
(33, 'andyperez@id.com', '$2y$12$48kPMDv8IvdaEhmj618THu023R6VVGbri2BMIaajsBLNUE0UBAZVy', 'Andres Raso', 'Perez', '2831698927', NULL, 'America/Mexico_City', 'es', NULL, 'guest', 6, NULL, 1, '2025-10-07 18:48:48', '2025-10-10 16:48:39'),
(34, 'jane@ranchoparaisoreal.com', '$2y$12$AGB88h0h6fsgzDdLqMHIaOvpNdqWamzp3WKPfMbFhwYM8If2PQqPu', 'Jane', 'Rosas', '4421083970', NULL, 'America/Mexico_City', 'es', NULL, 'hostess', 6, NULL, 1, '2025-10-11 20:32:17', '2025-10-11 20:32:17'),
(35, 'luis@hotelmorelia.com', '$2y$12$O63p8lNorP/yg1eSlr.xZ.snJZAIErYO83ZuoJdZ0/0f7LgHQzFYy', 'Luis', 'Dominguez', '0979079123', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 14, 1, 1, '2025-10-13 22:24:47', '2025-10-13 22:24:47'),
(36, 'dannabon@mayorbot.com', '$2y$12$E6NoCsFumgsQAnwVpheanOSgRrttQR9w0fGD2n4CFBABVNv3s1Fu2', 'Danna', 'Bonita', '9721903790', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 15, 2, 1, '2025-10-14 13:36:24', '2025-10-14 13:36:24'),
(37, 'idb@idb-hotels.mx', '$2y$12$ISFFWBHYId134wiYgLlQhuaqmEgHn1yP4rJ8dEsOUDj36899AVbg2', 'Isaac', 'Dehesa', '4424795381', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 16, 2, 1, '2025-10-14 19:22:31', '2025-10-14 19:22:31'),
(38, 'jane@impactosdigitales.com', '$2y$12$.X.egKV6mFcqN6P/A8Ifh.yqaEd.PyvaZ4s4e66vwQHSQL0nipSS6', 'Jane', 'Rosas', '2817358872', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 17, 2, 1, '2025-11-30 21:15:00', '2025-11-30 21:15:00'),
(39, 'hotelexhaciendalapitaya@gmail.com', '$2y$12$a2f0nRg36zVqZli6XmYsIeoiExOndW9IbO/ABxWo9UKHS9OJx51c.', 'Jorge', 'Ambriz', '4428252798', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 18, 1, 1, '2025-11-30 21:29:47', '2025-11-30 21:29:47'),
(40, 'andy@impactosdigitales.com', '$2y$12$Go7koxozZwICTzvVYasPQeDqTw5A2e/gw.P.AX/HkZ8Jdok1OV9Ei', 'Andrés', 'Raso', '4422198567', NULL, 'America/Mexico_City', 'es', NULL, 'admin', 19, 3, 1, '2026-03-12 00:36:04', '2026-03-12 00:36:04');

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `user_drafts`
--

CREATE TABLE `user_drafts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `svc` varchar(50) DEFAULT NULL,
  `step` varchar(50) DEFAULT NULL,
  `waiting` varchar(50) DEFAULT NULL,
  `hotelId` bigint(20) UNSIGNED DEFAULT NULL,
  `draft` text,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `user_subscriptions`
--

CREATE TABLE `user_subscriptions` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `subscription_id` int(11) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `is_unlimited` tinyint(1) DEFAULT '0' COMMENT 'Plan sin vigencia/vencimiento',
  `status` enum('active','expired','cancelled') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `user_subscriptions`
--

INSERT INTO `user_subscriptions` (`id`, `user_id`, `subscription_id`, `start_date`, `end_date`, `is_unlimited`, `status`, `created_at`, `updated_at`) VALUES
(1, 1, 3, '2025-10-04', '2026-10-04', 0, 'active', '2025-10-04 18:02:35', '2025-10-06 02:17:30'),
(2, 8, 3, '2025-10-04', '2026-10-04', 0, 'active', '2025-10-04 20:08:52', '2025-10-06 02:17:30'),
(3, 9, 2, '2025-10-04', '2025-11-03', 0, 'active', '2025-10-04 22:11:48', '2025-10-06 02:17:30'),
(4, 10, 3, '2025-10-04', '2026-10-04', 0, 'active', '2025-10-04 23:26:27', '2025-10-06 02:17:30'),
(5, 11, 2, '2025-10-04', '2025-11-03', 0, 'active', '2025-10-04 23:32:20', '2025-10-06 02:17:30'),
(6, 12, 3, '2025-10-04', '2026-10-04', 0, 'cancelled', '2025-10-05 00:39:39', '2025-10-06 03:10:58'),
(7, 14, 2, '2025-10-05', '2025-11-04', 0, 'active', '2025-10-05 16:06:03', '2025-10-06 02:17:30'),
(8, 17, 3, '2025-10-05', '2026-10-05', 0, 'active', '2025-10-05 20:21:15', '2025-10-06 02:17:30'),
(9, 24, 3, '2025-10-05', '2026-10-05', 0, 'active', '2025-10-05 23:23:04', '2025-10-06 02:17:30'),
(10, 25, 3, '2025-10-05', '2026-10-05', 0, 'active', '2025-10-05 23:24:25', '2025-10-06 02:17:30'),
(12, 12, 3, '2025-10-05', '2125-10-05', 1, 'active', '2025-10-06 03:12:18', '2025-10-06 03:12:18'),
(13, 36, 2, '2025-10-14', '2025-11-13', 0, 'cancelled', '2025-10-14 13:36:24', '2025-10-14 13:43:44'),
(14, 36, 2, '2025-10-14', '2025-11-14', 0, 'active', '2025-10-14 13:43:44', '2025-10-14 13:43:44'),
(15, 37, 2, '2025-10-14', '2025-11-13', 0, 'active', '2025-10-14 19:22:31', '2025-10-14 19:22:31'),
(16, 38, 2, '2025-11-30', '2025-12-30', 0, 'active', '2025-11-30 21:15:00', '2025-11-30 21:15:00'),
(17, 40, 3, '2026-03-11', '2027-03-11', 0, 'active', '2026-03-12 00:36:04', '2026-03-12 00:36:04');

-- --------------------------------------------------------

--
-- Estructura Stand-in para la vista `v_all_reservations`
-- (Véase abajo para la vista actual)
--
CREATE TABLE `v_all_reservations` (
`reservation_type` varchar(7)
,`id` int(11)
,`status` varchar(11)
,`created_at` timestamp
,`hotel_id` int(11)
,`resource_number` varchar(255)
,`reservation_date` date
,`reservation_time` time
,`guest_id` int(11)
,`guest_name` varchar(255)
,`guest_email` varchar(255)
,`guest_phone` varchar(20)
,`total_price` decimal(10,2)
,`notes` mediumtext
,`notification_sent` tinyint(4)
);

-- --------------------------------------------------------

--
-- Estructura para la vista `v_all_reservations`
--
DROP TABLE IF EXISTS `v_all_reservations`;

CREATE ALGORITHM=UNDEFINED DEFINER=`enolobot`@`localhost` SQL SECURITY DEFINER VIEW `v_all_reservations`  AS SELECT 'room' AS `reservation_type`, `rr`.`id` AS `id`, `rr`.`status` AS `status`, `rr`.`created_at` AS `created_at`, `r`.`hotel_id` AS `hotel_id`, `r`.`room_number` AS `resource_number`, `rr`.`check_in` AS `reservation_date`, NULL AS `reservation_time`, `rr`.`guest_id` AS `guest_id`, coalesce(`rr`.`guest_name`,concat(`u`.`first_name`,' ',`u`.`last_name`)) AS `guest_name`, coalesce(`rr`.`guest_email`,`u`.`email`) AS `guest_email`, coalesce(`rr`.`guest_phone`,`u`.`phone`) AS `guest_phone`, `rr`.`total_price` AS `total_price`, coalesce(`rr`.`special_requests`,`rr`.`notes`) AS `notes`, `rr`.`notification_sent` AS `notification_sent` FROM ((`room_reservations` `rr` join `rooms` `r` on((`rr`.`room_id` = `r`.`id`))) left join `users` `u` on((`rr`.`guest_id` = `u`.`id`)))union all select 'table' AS `reservation_type`,`tr`.`id` AS `id`,`tr`.`status` AS `status`,`tr`.`created_at` AS `created_at`,`rt`.`hotel_id` AS `hotel_id`,`rt`.`table_number` AS `resource_number`,`tr`.`reservation_date` AS `reservation_date`,`tr`.`reservation_time` AS `reservation_time`,`tr`.`guest_id` AS `guest_id`,coalesce(`tr`.`guest_name`,concat(`u`.`first_name`,' ',`u`.`last_name`)) AS `guest_name`,coalesce(`tr`.`guest_email`,`u`.`email`) AS `guest_email`,coalesce(`tr`.`guest_phone`,`u`.`phone`) AS `guest_phone`,NULL AS `total_price`,`tr`.`notes` AS `notes`,`tr`.`notification_sent` AS `notification_sent` from ((`table_reservations` `tr` join `restaurant_tables` `rt` on((`tr`.`table_id` = `rt`.`id`))) left join `users` `u` on((`tr`.`guest_id` = `u`.`id`))) union all select 'amenity' AS `reservation_type`,`ar`.`id` AS `id`,`ar`.`status` AS `status`,`ar`.`created_at` AS `created_at`,`a`.`hotel_id` AS `hotel_id`,`a`.`name` AS `resource_number`,`ar`.`reservation_date` AS `reservation_date`,`ar`.`reservation_time` AS `reservation_time`,`ar`.`user_id` AS `guest_id`,coalesce(`ar`.`guest_name`,concat(`u`.`first_name`,' ',`u`.`last_name`)) AS `guest_name`,coalesce(`ar`.`guest_email`,`u`.`email`) AS `guest_email`,coalesce(`ar`.`guest_phone`,`u`.`phone`) AS `guest_phone`,NULL AS `total_price`,coalesce(`ar`.`notes`,`ar`.`special_requests`) AS `notes`,`ar`.`notification_sent` AS `notification_sent` from ((`amenity_reservations` `ar` join `amenities` `a` on((`ar`.`amenity_id` = `a`.`id`))) left join `users` `u` on((`ar`.`user_id` = `u`.`id`)))  ;

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `activity_log`
--
ALTER TABLE `activity_log`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_entity` (`entity_type`,`entity_id`),
  ADD KEY `idx_action` (`action`),
  ADD KEY `idx_created` (`created_at`);

--
-- Indices de la tabla `amenities`
--
ALTER TABLE `amenities`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_category` (`category`);

--
-- Indices de la tabla `amenity_reservations`
--
ALTER TABLE `amenity_reservations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_amenity` (`amenity_id`),
  ADD KEY `idx_reservation_date` (`reservation_date`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_confirmation` (`confirmation_code`);

--
-- Indices de la tabla `availability_calendar`
--
ALTER TABLE `availability_calendar`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_availability` (`hotel_id`,`resource_type`,`resource_id`,`date`),
  ADD KEY `idx_hotel_date` (`hotel_id`,`date`),
  ADD KEY `idx_resource` (`resource_type`,`resource_id`,`date`);

--
-- Indices de la tabla `bank_accounts`
--
ALTER TABLE `bank_accounts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_active` (`is_active`),
  ADD KEY `idx_bank_name` (`bank_name`);

--
-- Indices de la tabla `cart_items`
--
ALTER TABLE `cart_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `dish_id` (`dish_id`),
  ADD KEY `idx_cart` (`cart_id`);

--
-- Indices de la tabla `chatbot_reservations`
--
ALTER TABLE `chatbot_reservations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_resource` (`resource_type`,`resource_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_expires` (`expires_at`);

--
-- Indices de la tabla `discount_codes`
--
ALTER TABLE `discount_codes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD KEY `idx_code` (`code`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_active` (`active`),
  ADD KEY `idx_valid_dates` (`valid_from`,`valid_to`);

--
-- Indices de la tabla `discount_code_usages`
--
ALTER TABLE `discount_code_usages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_discount_code` (`discount_code_id`),
  ADD KEY `idx_reservation` (`reservation_id`,`reservation_type`),
  ADD KEY `idx_used_at` (`used_at`);

--
-- Indices de la tabla `dishes`
--
ALTER TABLE `dishes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_category` (`category`),
  ADD KEY `idx_available` (`is_available`),
  ADD KEY `idx_price` (`price`);

--
-- Indices de la tabla `email_notifications`
--
ALTER TABLE `email_notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_recipient` (`recipient_email`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_type` (`notification_type`),
  ADD KEY `idx_related` (`related_type`,`related_id`);

--
-- Indices de la tabla `export_queue`
--
ALTER TABLE `export_queue`
  ADD PRIMARY KEY (`id`),
  ADD KEY `hotel_id` (`hotel_id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_created` (`created_at`);

--
-- Indices de la tabla `global_settings`
--
ALTER TABLE `global_settings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `setting_key` (`setting_key`),
  ADD KEY `updated_by` (`updated_by`),
  ADD KEY `idx_category` (`category`),
  ADD KEY `idx_key` (`setting_key`);

--
-- Indices de la tabla `global_statistics`
--
ALTER TABLE `global_statistics`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_stat` (`stat_date`,`stat_type`),
  ADD KEY `idx_date` (`stat_date`),
  ADD KEY `idx_type` (`stat_type`);

--
-- Indices de la tabla `hotels`
--
ALTER TABLE `hotels`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_owner` (`owner_id`),
  ADD KEY `idx_subscription` (`subscription_status`);

--
-- Indices de la tabla `hotel_settings`
--
ALTER TABLE `hotel_settings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_hotel_setting` (`hotel_id`,`setting_key`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_category` (`category`);

--
-- Indices de la tabla `hotel_statistics`
--
ALTER TABLE `hotel_statistics`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_hotel_stat` (`hotel_id`,`stat_date`,`stat_type`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_date` (`stat_date`),
  ADD KEY `idx_type` (`stat_type`);

--
-- Indices de la tabla `hotel_subscriptions`
--
ALTER TABLE `hotel_subscriptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `plan_id` (`plan_id`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_dates` (`start_date`,`end_date`);

--
-- Indices de la tabla `invoices`
--
ALTER TABLE `invoices`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `invoice_number` (`invoice_number`),
  ADD KEY `order_id` (`order_id`),
  ADD KEY `idx_invoice_number` (`invoice_number`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_dates` (`invoice_date`,`due_date`);

--
-- Indices de la tabla `invoice_items`
--
ALTER TABLE `invoice_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_invoice` (`invoice_id`);

--
-- Indices de la tabla `loyalty_program`
--
ALTER TABLE `loyalty_program`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `referral_code` (`referral_code`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_referral_code` (`referral_code`);

--
-- Indices de la tabla `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_read` (`is_read`),
  ADD KEY `idx_type` (`type`),
  ADD KEY `idx_created` (`created_at`);

--
-- Indices de la tabla `notification_preferences`
--
ALTER TABLE `notification_preferences`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_user_type` (`user_id`,`notification_type`),
  ADD KEY `idx_user` (`user_id`);

--
-- Indices de la tabla `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `guest_id` (`guest_id`),
  ADD KEY `table_id` (`table_id`),
  ADD KEY `room_id` (`room_id`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_payment_status` (`payment_status`),
  ADD KEY `idx_created` (`created_at`);

--
-- Indices de la tabla `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `dish_id` (`dish_id`),
  ADD KEY `idx_order` (`order_id`);

--
-- Indices de la tabla `password_resets`
--
ALTER TABLE `password_resets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `token` (`token`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `idx_token` (`token`),
  ADD KEY `idx_expires` (`expires_at`);

--
-- Indices de la tabla `payment_transactions`
--
ALTER TABLE `payment_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_order` (`order_id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_transaction` (`transaction_id`),
  ADD KEY `idx_subscription` (`subscription_id`);

--
-- Indices de la tabla `referrals`
--
ALTER TABLE `referrals`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_referrer` (`referrer_id`),
  ADD KEY `idx_referred` (`referred_user_id`),
  ADD KEY `idx_status` (`status`);

--
-- Indices de la tabla `reports`
--
ALTER TABLE `reports`
  ADD PRIMARY KEY (`id`),
  ADD KEY `created_by` (`created_by`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_type` (`report_type`),
  ADD KEY `idx_status` (`status`);

--
-- Indices de la tabla `report_generations`
--
ALTER TABLE `report_generations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_report` (`report_id`),
  ADD KEY `idx_generated` (`generated_at`);

--
-- Indices de la tabla `resource_blocks`
--
ALTER TABLE `resource_blocks`
  ADD PRIMARY KEY (`id`),
  ADD KEY `blocked_by` (`blocked_by`),
  ADD KEY `idx_resource` (`resource_type`,`resource_id`),
  ADD KEY `idx_dates` (`start_date`,`end_date`);

--
-- Indices de la tabla `resource_images`
--
ALTER TABLE `resource_images`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_resource` (`resource_type`,`resource_id`),
  ADD KEY `idx_primary` (`is_primary`);

--
-- Indices de la tabla `restaurant_tables`
--
ALTER TABLE `restaurant_tables`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_table` (`hotel_id`,`table_number`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_status` (`status`);

--
-- Indices de la tabla `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_user_hotel` (`user_id`,`hotel_id`),
  ADD KEY `created_by` (`created_by`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_role` (`role_name`);

--
-- Indices de la tabla `rooms`
--
ALTER TABLE `rooms`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_room` (`hotel_id`,`room_number`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_type` (`type`),
  ADD KEY `idx_price` (`price`);

--
-- Indices de la tabla `room_reservations`
--
ALTER TABLE `room_reservations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `confirmation_code` (`confirmation_code`),
  ADD KEY `guest_id` (`guest_id`),
  ADD KEY `idx_room` (`room_id`),
  ADD KEY `idx_dates` (`check_in`,`check_out`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_confirmation` (`confirmation_code`),
  ADD KEY `idx_email_confirmed` (`email_confirmed`),
  ADD KEY `idx_hotel_room` (`hotel_id`),
  ADD KEY `fk_room_reservation_discount` (`discount_code_id`);

--
-- Indices de la tabla `service_requests`
--
ALTER TABLE `service_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `guest_id` (`guest_id`),
  ADD KEY `assigned_to` (`assigned_to`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_priority` (`priority`),
  ADD KEY `idx_created` (`requested_at`),
  ADD KEY `idx_service_type` (`service_type_id`);

--
-- Indices de la tabla `service_type_catalog`
--
ALTER TABLE `service_type_catalog`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_active` (`is_active`),
  ADD KEY `idx_sort` (`sort_order`);

--
-- Indices de la tabla `shopping_cart`
--
ALTER TABLE `shopping_cart`
  ADD PRIMARY KEY (`id`),
  ADD KEY `hotel_id` (`hotel_id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_session` (`session_id`);

--
-- Indices de la tabla `subscriptions`
--
ALTER TABLE `subscriptions`
  ADD PRIMARY KEY (`id`);

--
-- Indices de la tabla `subscription_plans`
--
ALTER TABLE `subscription_plans`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `slug` (`slug`),
  ADD KEY `idx_slug` (`slug`),
  ADD KEY `idx_active` (`is_active`);

--
-- Indices de la tabla `system_notifications`
--
ALTER TABLE `system_notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_is_read` (`is_read`),
  ADD KEY `idx_type` (`notification_type`),
  ADD KEY `idx_created` (`created_at`);

--
-- Indices de la tabla `table_reservations`
--
ALTER TABLE `table_reservations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `confirmation_code` (`confirmation_code`),
  ADD KEY `guest_id` (`guest_id`),
  ADD KEY `idx_table` (`table_id`),
  ADD KEY `idx_date` (`reservation_date`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_confirmation` (`confirmation_code`),
  ADD KEY `idx_email_confirmed` (`email_confirmed`),
  ADD KEY `idx_hotel_table` (`hotel_id`);

--
-- Indices de la tabla `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_email` (`email`),
  ADD KEY `idx_role` (`role`),
  ADD KEY `idx_hotel` (`hotel_id`),
  ADD KEY `idx_created` (`created_at`);

--
-- Indices de la tabla `user_drafts`
--
ALTER TABLE `user_drafts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `ux_user` (`user_id`);

--
-- Indices de la tabla `user_subscriptions`
--
ALTER TABLE `user_subscriptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `subscription_id` (`subscription_id`),
  ADD KEY `idx_user` (`user_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_unlimited` (`is_unlimited`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `activity_log`
--
ALTER TABLE `activity_log`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT de la tabla `amenities`
--
ALTER TABLE `amenities`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=24;

--
-- AUTO_INCREMENT de la tabla `amenity_reservations`
--
ALTER TABLE `amenity_reservations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=23;

--
-- AUTO_INCREMENT de la tabla `availability_calendar`
--
ALTER TABLE `availability_calendar`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `bank_accounts`
--
ALTER TABLE `bank_accounts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de la tabla `cart_items`
--
ALTER TABLE `cart_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `chatbot_reservations`
--
ALTER TABLE `chatbot_reservations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `discount_codes`
--
ALTER TABLE `discount_codes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT de la tabla `discount_code_usages`
--
ALTER TABLE `discount_code_usages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `dishes`
--
ALTER TABLE `dishes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- AUTO_INCREMENT de la tabla `email_notifications`
--
ALTER TABLE `email_notifications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `export_queue`
--
ALTER TABLE `export_queue`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `global_settings`
--
ALTER TABLE `global_settings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=163;

--
-- AUTO_INCREMENT de la tabla `global_statistics`
--
ALTER TABLE `global_statistics`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `hotels`
--
ALTER TABLE `hotels`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT de la tabla `hotel_settings`
--
ALTER TABLE `hotel_settings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=50;

--
-- AUTO_INCREMENT de la tabla `hotel_statistics`
--
ALTER TABLE `hotel_statistics`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `hotel_subscriptions`
--
ALTER TABLE `hotel_subscriptions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `invoices`
--
ALTER TABLE `invoices`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `invoice_items`
--
ALTER TABLE `invoice_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `loyalty_program`
--
ALTER TABLE `loyalty_program`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de la tabla `notifications`
--
ALTER TABLE `notifications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `notification_preferences`
--
ALTER TABLE `notification_preferences`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `order_items`
--
ALTER TABLE `order_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `password_resets`
--
ALTER TABLE `password_resets`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT de la tabla `payment_transactions`
--
ALTER TABLE `payment_transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de la tabla `referrals`
--
ALTER TABLE `referrals`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `reports`
--
ALTER TABLE `reports`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `report_generations`
--
ALTER TABLE `report_generations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `resource_blocks`
--
ALTER TABLE `resource_blocks`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT de la tabla `resource_images`
--
ALTER TABLE `resource_images`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=115;

--
-- AUTO_INCREMENT de la tabla `restaurant_tables`
--
ALTER TABLE `restaurant_tables`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT de la tabla `role_permissions`
--
ALTER TABLE `role_permissions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT de la tabla `rooms`
--
ALTER TABLE `rooms`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT de la tabla `room_reservations`
--
ALTER TABLE `room_reservations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=25;

--
-- AUTO_INCREMENT de la tabla `service_requests`
--
ALTER TABLE `service_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT de la tabla `service_type_catalog`
--
ALTER TABLE `service_type_catalog`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=121;

--
-- AUTO_INCREMENT de la tabla `shopping_cart`
--
ALTER TABLE `shopping_cart`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `subscriptions`
--
ALTER TABLE `subscriptions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT de la tabla `subscription_plans`
--
ALTER TABLE `subscription_plans`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT de la tabla `system_notifications`
--
ALTER TABLE `system_notifications`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=65;

--
-- AUTO_INCREMENT de la tabla `table_reservations`
--
ALTER TABLE `table_reservations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT de la tabla `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=41;

--
-- AUTO_INCREMENT de la tabla `user_drafts`
--
ALTER TABLE `user_drafts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT de la tabla `user_subscriptions`
--
ALTER TABLE `user_subscriptions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `activity_log`
--
ALTER TABLE `activity_log`
  ADD CONSTRAINT `activity_log_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `activity_log_ibfk_2` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `amenities`
--
ALTER TABLE `amenities`
  ADD CONSTRAINT `amenities_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `amenity_reservations`
--
ALTER TABLE `amenity_reservations`
  ADD CONSTRAINT `amenity_reservations_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `amenity_reservations_ibfk_2` FOREIGN KEY (`amenity_id`) REFERENCES `amenities` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `amenity_reservations_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `availability_calendar`
--
ALTER TABLE `availability_calendar`
  ADD CONSTRAINT `availability_calendar_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `cart_items`
--
ALTER TABLE `cart_items`
  ADD CONSTRAINT `cart_items_ibfk_1` FOREIGN KEY (`cart_id`) REFERENCES `shopping_cart` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `cart_items_ibfk_2` FOREIGN KEY (`dish_id`) REFERENCES `dishes` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `chatbot_reservations`
--
ALTER TABLE `chatbot_reservations`
  ADD CONSTRAINT `chatbot_reservations_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `discount_codes`
--
ALTER TABLE `discount_codes`
  ADD CONSTRAINT `discount_codes_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `discount_code_usages`
--
ALTER TABLE `discount_code_usages`
  ADD CONSTRAINT `discount_code_usages_ibfk_1` FOREIGN KEY (`discount_code_id`) REFERENCES `discount_codes` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `dishes`
--
ALTER TABLE `dishes`
  ADD CONSTRAINT `dishes_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `export_queue`
--
ALTER TABLE `export_queue`
  ADD CONSTRAINT `export_queue_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `export_queue_ibfk_2` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `global_settings`
--
ALTER TABLE `global_settings`
  ADD CONSTRAINT `global_settings_ibfk_1` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `hotels`
--
ALTER TABLE `hotels`
  ADD CONSTRAINT `hotels_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `hotel_settings`
--
ALTER TABLE `hotel_settings`
  ADD CONSTRAINT `hotel_settings_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `hotel_statistics`
--
ALTER TABLE `hotel_statistics`
  ADD CONSTRAINT `hotel_statistics_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `hotel_subscriptions`
--
ALTER TABLE `hotel_subscriptions`
  ADD CONSTRAINT `hotel_subscriptions_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `hotel_subscriptions_ibfk_2` FOREIGN KEY (`plan_id`) REFERENCES `subscription_plans` (`id`);

--
-- Filtros para la tabla `invoices`
--
ALTER TABLE `invoices`
  ADD CONSTRAINT `invoices_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `invoices_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `invoices_ibfk_3` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `invoice_items`
--
ALTER TABLE `invoice_items`
  ADD CONSTRAINT `invoice_items_ibfk_1` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `loyalty_program`
--
ALTER TABLE `loyalty_program`
  ADD CONSTRAINT `loyalty_program_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `notifications_ibfk_2` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `notification_preferences`
--
ALTER TABLE `notification_preferences`
  ADD CONSTRAINT `notification_preferences_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `orders_ibfk_2` FOREIGN KEY (`guest_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `orders_ibfk_3` FOREIGN KEY (`table_id`) REFERENCES `restaurant_tables` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `orders_ibfk_4` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`dish_id`) REFERENCES `dishes` (`id`);

--
-- Filtros para la tabla `password_resets`
--
ALTER TABLE `password_resets`
  ADD CONSTRAINT `password_resets_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `payment_transactions`
--
ALTER TABLE `payment_transactions`
  ADD CONSTRAINT `fk_payment_subscription` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `payment_transactions_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `payment_transactions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

--
-- Filtros para la tabla `referrals`
--
ALTER TABLE `referrals`
  ADD CONSTRAINT `referrals_ibfk_1` FOREIGN KEY (`referrer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `referrals_ibfk_2` FOREIGN KEY (`referred_user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `reports`
--
ALTER TABLE `reports`
  ADD CONSTRAINT `reports_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `reports_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`);

--
-- Filtros para la tabla `report_generations`
--
ALTER TABLE `report_generations`
  ADD CONSTRAINT `report_generations_ibfk_1` FOREIGN KEY (`report_id`) REFERENCES `reports` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `resource_blocks`
--
ALTER TABLE `resource_blocks`
  ADD CONSTRAINT `resource_blocks_ibfk_1` FOREIGN KEY (`blocked_by`) REFERENCES `users` (`id`);

--
-- Filtros para la tabla `restaurant_tables`
--
ALTER TABLE `restaurant_tables`
  ADD CONSTRAINT `restaurant_tables_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `role_permissions_ibfk_3` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `rooms`
--
ALTER TABLE `rooms`
  ADD CONSTRAINT `rooms_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `room_reservations`
--
ALTER TABLE `room_reservations`
  ADD CONSTRAINT `fk_room_reservation_discount` FOREIGN KEY (`discount_code_id`) REFERENCES `discount_codes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_room_reservations_hotel` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `room_reservations_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `room_reservations_ibfk_2` FOREIGN KEY (`guest_id`) REFERENCES `users` (`id`);

--
-- Filtros para la tabla `service_requests`
--
ALTER TABLE `service_requests`
  ADD CONSTRAINT `fk_service_type` FOREIGN KEY (`service_type_id`) REFERENCES `service_type_catalog` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `service_requests_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `service_requests_ibfk_2` FOREIGN KEY (`guest_id`) REFERENCES `users` (`id`),
  ADD CONSTRAINT `service_requests_ibfk_3` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Filtros para la tabla `service_type_catalog`
--
ALTER TABLE `service_type_catalog`
  ADD CONSTRAINT `service_type_catalog_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `shopping_cart`
--
ALTER TABLE `shopping_cart`
  ADD CONSTRAINT `shopping_cart_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `shopping_cart_ibfk_2` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `system_notifications`
--
ALTER TABLE `system_notifications`
  ADD CONSTRAINT `system_notifications_ibfk_1` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `system_notifications_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Filtros para la tabla `table_reservations`
--
ALTER TABLE `table_reservations`
  ADD CONSTRAINT `fk_table_reservations_hotel` FOREIGN KEY (`hotel_id`) REFERENCES `hotels` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `table_reservations_ibfk_1` FOREIGN KEY (`table_id`) REFERENCES `restaurant_tables` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `table_reservations_ibfk_2` FOREIGN KEY (`guest_id`) REFERENCES `users` (`id`);

--
-- Filtros para la tabla `user_subscriptions`
--
ALTER TABLE `user_subscriptions`
  ADD CONSTRAINT `user_subscriptions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `user_subscriptions_ibfk_2` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions` (`id`);

DELIMITER $$
--
-- Eventos
--
CREATE DEFINER=`enolobot`@`localhost` EVENT `auto_release_room_reservations` ON SCHEDULE EVERY 1 HOUR STARTS '2025-10-05 12:16:17' ON COMPLETION NOT PRESERVE ENABLE DO BEGIN
    -- Liberar habitaciones a las 15:00 del día después del checkout
    UPDATE room_reservations
    SET status = 'checked_out'
    WHERE status = 'checked_in'
      AND check_out_date < CURDATE()
      AND HOUR(NOW()) >= 15;
      
    -- También actualizar el estado de las habitaciones
    UPDATE rooms r
    INNER JOIN room_reservations rr ON r.id = rr.room_id
    SET r.status = 'available'
    WHERE rr.status = 'checked_out'
      AND rr.check_out_date < CURDATE()
      AND r.status = 'occupied';
END$$

CREATE DEFINER=`enolobot`@`localhost` EVENT `auto_release_table_amenity_reservations` ON SCHEDULE EVERY 5 MINUTE STARTS '2025-10-05 12:16:17' ON COMPLETION NOT PRESERVE ENABLE DO BEGIN
    -- Liberar reservaciones de mesas después de 2 horas
    UPDATE table_reservations
    SET status = 'completed'
    WHERE status IN ('confirmed', 'seated')
      AND TIMESTAMPDIFF(HOUR, 
          CONCAT(reservation_date, ' ', reservation_time), 
          NOW()) >= 2;
    
    -- Liberar reservaciones de amenidades después de 2 horas
    UPDATE amenity_reservations
    SET status = 'completed'
    WHERE status IN ('confirmed', 'in_use')
      AND TIMESTAMPDIFF(HOUR, 
          CONCAT(reservation_date, ' ', reservation_time), 
          NOW()) >= 2;
END$$

DELIMITER ;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

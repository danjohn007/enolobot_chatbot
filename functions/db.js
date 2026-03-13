// db.js
import mysql from "mysql2/promise";
import { logger } from "./config.js";
import { hotel } from "./hotelconfig.js";

let pool = null;

// Helper constant for time adjustment - subtract 1 hour from NOW() to match local time
// Note: This constant is primarily for documentation. In SQL queries, we use the literal
// "DATE_SUB(NOW(), INTERVAL 1 HOUR)" directly for clarity and to avoid string interpolation.
export const NOW_MINUS_ONE_HOUR = "DATE_SUB(NOW(), INTERVAL 1 HOUR)";

export function getPool(cfg) {
  if (!pool) {
    pool = mysql.createPool({
      host: cfg.DB_HOST,
      user: cfg.DB_USER,
      password: cfg.DB_PASSWORD,
      database: cfg.DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
    logger.info({ svc: "db", msg: "pool_created" });

    // ✅ Aplicar TZ local a CADA nueva conexión del pool usando el wrapper de promesas
    pool.on("connection", (conn) => {
      conn
        .promise()
        .query("SET time_zone = '-06:00'")
        .then(() => logger.info("[DB] TZ sesión = -06:00 aplicada a nueva conexión"))
        .catch((err) =>
          logger.error({ svc: "db", step: "set_tz_on_connection", error: err?.message || err })
        );
    });

    // ✅ Además, aplicar TZ en el contexto actual del pool (por si ya hay una sesión abierta)
    pool
      .query("SET time_zone = '-06:00'")
      .then(() => logger.info("[DB] TZ sesión = -06:00 aplicada en pool.query"))
      .catch((err) =>
        logger.error({ svc: "db", step: "set_tz_on_pool", error: err?.message || err })
      );
  }
  return pool;
}

// === Conversation State Management ===

/**
 * Ensure the user_drafts table exists for managing conversation state
 */
export async function ensureConversationTables(pool) {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS user_drafts (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id BIGINT UNSIGNED NOT NULL,
        svc VARCHAR(50) NULL,
        step VARCHAR(50) NULL,
        waiting VARCHAR(50) NULL,
        hotelId BIGINT UNSIGNED NULL,
        draft TEXT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY ux_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    logger.info({ svc: 'db', action: 'ensureConversationTables', status: 'success' });
  } catch (err) {
    logger.error({ svc: 'db', action: 'ensureConversationTables', error: err.message });
    throw err;
  }
}

// === Phone normalization ===
function onlyDigits(s) {
  return (s || '').replace(/\D+/g, '');
}

/**
 * Normalizes a phone number to E.164 MX format: +52 + 10 digits (without the '1' from WhatsApp JID)
 * @param {string} input - Phone number in various formats
 * @returns {string|null} - Normalized phone in format +52XXXXXXXXXX or null if invalid
 */
export function normalizePhoneMX(input) {
  if (!input) return null;
  const digits = String(input).replace(/\D+/g, '');

  // Casos típicos:
  // 1) 521XXXXXXXXXX (JID de WhatsApp MX móvil) -> +52XXXXXXXXXX
  if (digits.length === 13 && digits.startsWith('521')) {
    return '+52' + digits.slice(3);
  }
  // 2) 52XXXXXXXXXX -> +52XXXXXXXXXX
  if (digits.length === 12 && digits.startsWith('52')) {
    return '+52' + digits.slice(2);
  }
  // 3) XXXXXXXXXX (nacional) -> +52XXXXXXXXXX
  if (digits.length === 10) {
    return '+52' + digits;
  }
  // 4) Ya viene con +52XXXXXXXXXX
  if (digits.length === 12 && input.startsWith('+52')) {
    return '+52' + digits.slice(2);
  }

  // Fallback: si no es MX válido, devuelve con '+' si tenía código país
  return input.startsWith('+') ? input : '+' + digits;
}

/**
 * Gets a user by phone number, normalizing the input phone to E.164 format
 * @param {Object} pool - Database connection pool
 * @param {string} rawFrom - Raw phone number from webhook
 * @returns {Promise<Object|null>} - User object or null if not found
 */
export async function getUserByPhone(pool, rawFrom) {
  const phone = normalizePhoneMX(rawFrom);
  if (!phone) return null;

  const [rows] = await pool.execute(
    'SELECT * FROM users WHERE phone = ? LIMIT 1',
    [phone]
  );
  return rows?.[0] || null;
}

/**
 * Inserts a new guest user into the users table
 * Returns { id, existed } where existed=true if user already exists by phone
 */
export async function insertGuestUser(pool, user) {
  const {
    first_name,
    last_name,
    email = null,
    phone,
    avatar = null,
    timezone = 'America/Mexico_City',
    language = 'es',
    last_login = null,
    role = 'guest',
    hotel_id = 6,
    subscription_id = null,
    is_active = 1
  } = user;

  // Normalize phone to E.164 format
  const normPhone = normalizePhoneMX(phone);

  // Avoid duplicates by telephone
  const [exists] = await pool.query(
    'SELECT id FROM users WHERE phone = ? LIMIT 1',
    [normPhone]
  );
  if (exists.length) {
    logger.info({ svc: 'db', action: 'insertGuestUser', existed: true, userId: exists[0].id });
    return { id: exists[0].id, existed: true };
  }

  try {
    const [res] = await pool.query(
      `
      INSERT INTO users
        (first_name, last_name, email, phone, avatar, timezone, language, last_login, role, hotel_id, subscription_id, is_active)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        first_name ?? null,
        last_name ?? null,
        email ?? null,
        normPhone,
        avatar,                         // NULL
        timezone,                       // 'America/Mexico_City'
        language,                       // 'es'
        last_login,                     // NULL
        role,                           // 'guest'
        hotel_id,                       // 6
        subscription_id,                // NULL
        is_active                       // 1
      ]
    );

    logger.info({ svc: 'db', action: 'insertGuestUser', insertId: res.insertId, phone: normPhone, email: email ?? null });
    return { id: res.insertId, existed: false };
  } catch (err) {
    logger.error({ svc: 'db', action: 'insertGuestUser', error: err.message, code: err.code });
    throw err;
  }
}

// === Room functions ===

/**
 * Lista habitaciones por hotel, con paginación opcional.
 * Por defecto solo 'available'; usa includeAll:true para traer todas.
 * @param {Object} pool - Database connection pool
 * @param {number} hotelId - Hotel ID
 * @param {Object} options - Options object
 * @param {number|null} options.limit - Maximum number of rooms to return (null = no limit)
 * @param {number} options.offset - Number of rooms to skip
 * @param {boolean} options.includeAll - If true, returns all rooms regardless of status
 * @returns {Promise<Array>} Array of room objects
 */
export async function listRoomsForHotel(pool, hotelId, { limit = null, offset = 0, includeAll = false } = {}) {
  let sql = `
    SELECT
      r.id,
      r.hotel_id,
      r.room_number,
      r.type,
      r.capacity,
      r.price,
      r.status,
      r.floor,
      r.description,
      r.amenities
    FROM rooms r
    WHERE r.hotel_id = ?
      ${includeAll ? '' : `AND r.status = 'available'`}
    ORDER BY r.room_number ASC, r.id ASC
  `;
  const params = [hotelId];
  if (Number.isInteger(limit) && limit > 0) {
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset || 0);
  }
  const [rows] = await pool.query(sql, params);
  return rows;
}

export async function listAvailableRoomsForHotel(pool, hotelId, limit = 3) {
  const placeholders = hotel.availableStatuses.map(() => "?").join(",");
  const [rows] = await pool.execute(
    `
    SELECT
      r.id, r.room_number, r.type, r.capacity, r.price, r.status, r.floor, r.description,
      r.price_monday, r.price_tuesday, r.price_wednesday, r.price_thursday,
      r.price_friday, r.price_saturday, r.price_sunday,
      (SELECT ri.image_path FROM resource_images ri
       WHERE ri.resource_type='room' AND ri.resource_id=r.id
       ORDER BY ri.is_primary DESC, ri.display_order ASC, ri.id ASC LIMIT 1) AS primary_image_path
    FROM rooms r
    WHERE r.hotel_id=? AND LOWER(r.status) IN (${placeholders})
    ORDER BY r.id DESC
    LIMIT ?
    `,
    [hotelId, ...hotel.availableStatuses, limit]
  );
  return rows;
}

export async function getRoomImages(pool, roomId, limit = 50) {
  const [rows] = await pool.execute(
    `SELECT image_path
     FROM resource_images
     WHERE resource_type='room' AND resource_id=?
     ORDER BY is_primary DESC, display_order ASC, id ASC
     LIMIT ?`,
    [roomId, limit]
  );
  return rows.map(r => r.image_path);
}

export async function getLastRoomDraft(pool, guestId) {
  const [rows] = await pool.execute(
    `SELECT * FROM room_reservations
     WHERE guest_id=? AND status='draft'
     ORDER BY id DESC LIMIT 1`,
    [guestId]
  );
  return rows?.[0] || null;
}

export async function getRecentRoomDraftForRoom(pool, guestId, roomId) {
  // Check for drafts updated within last 30 minutes of local time (NOW - 1 hour - 30 minutes)
  const [rows] = await pool.execute(
    `SELECT * FROM room_reservations
     WHERE guest_id=? AND room_id=? AND status='draft'
       AND updated_at >= DATE_SUB(DATE_SUB(NOW(), INTERVAL 1 HOUR), INTERVAL 30 MINUTE)
     ORDER BY id DESC LIMIT 1`,
    [guestId, roomId]
  );
  return rows?.[0] || null;
}

export async function cleanupRoomDraftsForGuest(pool, guestId, exceptId) {
  await pool.execute(
    `DELETE FROM room_reservations
      WHERE guest_id=? AND status='draft' AND id <> ?`,
    [guestId, exceptId ?? -1]
  );
}

/**
 * Insert final room reservation after user confirms.
 * Validates data and checks for overlapping reservations.
 * This is the ONLY place where room_reservations should be inserted.
 * @param {Object} pool - Database connection pool
 * @param {Object} data - Reservation data
 * @returns {Promise<{id: number}>} Inserted reservation ID
 */
export async function insertRoomReservationFinal(pool, data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      hotel_id,
      room_id,
      user_id = null,
      phone = null,
      guest_name = null,
      guest_email = null,
      checkin_date,  // Accept as parameter name
      checkout_date, // Accept as parameter name
      total_price = null,
      status = 'pending',
      notes = null,
    } = data;

    // Validate required fields
    if (!hotel_id || !room_id || !checkin_date || !checkout_date) {
      throw new Error('missing_required_fields');
    }

    // Check for overlapping reservations (basic overlap check)
    // Note: Table columns are check_in and check_out (underscore notation)
    const [overlap] = await conn.query(
      `SELECT id FROM room_reservations
        WHERE room_id = ?
          AND status IN ('pending','confirmed')
          AND NOT (check_out <= ? OR check_in >= ?)
        LIMIT 1`,
      [room_id, checkin_date, checkout_date]
    );
    
    if (overlap.length) {
      throw new Error('room_unavailable_range');
    }

    // Insert the reservation - use check_in and check_out column names
    const [result] = await conn.query(
      `INSERT INTO room_reservations
         (hotel_id, room_id, guest_id, guest_name, guest_email, guest_phone,
          check_in, check_out, total_price, status, notes, 
          notification_sent, email_confirmed, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0,0,DATE_SUB(NOW(), INTERVAL 1 HOUR),DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
      [
        hotel_id,
        room_id,
        user_id,
        guest_name,
        guest_email,
        phone,
        checkin_date,  // Maps to check_in column
        checkout_date, // Maps to check_out column
        total_price,
        status,
        notes
      ]
    );

    await conn.commit();
    logger.info({ 
      svc: 'room_resv', 
      action: 'confirmed', 
      reservation_id: result.insertId, 
      user_id, 
      room_id 
    });
    return { id: result.insertId };
  } catch (err) {
    await conn.rollback();
    logger.error({ svc: 'room_resv', action: 'confirm_error', error: err.message });
    throw err;
  } finally {
    conn.release();
  }
}

// === Amenity functions ===

// Helper: detect if a column exists in a table
export async function hasColumn(pool, table, column) {
  const [r] = await pool.execute(
    `SELECT COUNT(*) c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [table, column]
  );
  return r[0].c > 0;
}

// Lista amenidades disponibles para un hotel, con opción de paginar.
export async function listAvailableAmenitiesForHotel(pool, hotelId, options = {}) {
  const { limit = null, offset = 0 } = options;
  
  // Check if is_available column exists, otherwise fallback to basic filter
  const hasIsAvailable = await hasColumn(pool, 'amenities', 'is_available');
  const where = hasIsAvailable ? 'a.hotel_id=? AND a.is_available=1' : 'a.hotel_id=?';

  let sql = `
    SELECT
      a.id, a.hotel_id, a.name, a.category, a.price, a.capacity, a.description,
      a.opening_time, a.closing_time, a.block_duration_hours, a.allow_overlap,
      (SELECT ri.image_path
         FROM resource_images ri
         WHERE ri.resource_type='amenity' AND ri.resource_id=a.id
         ORDER BY ri.is_primary DESC, ri.display_order ASC, ri.id ASC
         LIMIT 1) AS primary_image_path
    FROM amenities a
    WHERE ${where}
    ORDER BY a.name ASC, a.id ASC
  `;
  
  const params = [hotelId];
  if (Number.isInteger(limit) && limit > 0) {
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset || 0);
  }
  
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// Obtiene una amenidad por id, tolerante a columnas opcionales
export async function getAmenityById(pool, amenityId) {
  // Check for optional columns
  const hasBlock = await hasColumn(pool, 'amenities', 'block_duration_hours');
  const hasOverlap = await hasColumn(pool, 'amenities', 'allow_overlap');
  const hasMaxReservations = await hasColumn(pool, 'amenities', 'max_reservations');
  const hasIsAvailable = await hasColumn(pool, 'amenities', 'is_available');
  
  const sql = `
    SELECT
      a.id, a.hotel_id, a.name, a.category, a.price, a.capacity,
      a.description, a.opening_time, a.closing_time
      ${hasBlock ? ', a.block_duration_hours' : ''}
      ${hasOverlap ? ', a.allow_overlap' : ''}
      ${hasMaxReservations ? ', a.max_reservations' : ''}
      ${hasIsAvailable ? ', a.is_available' : ''}
    FROM amenities a
    WHERE a.id = ?
    LIMIT 1
  `;
  const [rows] = await pool.execute(sql, [amenityId]);
  return rows?.[0] || null;
}

// Crea draft en amenity_reservations con defaults válidos
export async function createAmenityDraft(pool, { hotelId, user, amenity }) {
  const durMin = Math.max(1, Number(amenity.block_duration_hours) || 1) * 60; // defaults to 60 minutes (1 hour * 60) if block_duration_hours is missing or 0
  const guestName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim() || user?.first_name || '';
  const guestPhone = user?.phone || null;

  // Flow state stored separately in user_drafts, not in notes field
  const flowState = {
    flow: 'amenity',
    step: user?.email ? 'date' : 'enter_email',
    waiting: user?.email ? 'date' : 'email',
    amenityId: amenity.id,
    amenityName: amenity.name,
    category: amenity.category,
    price: Number(amenity.price) || 0,
    capacity: Number(amenity.capacity) || 1,
    opening_time: amenity.opening_time || null,
    closing_time: amenity.closing_time || null,
    allow_overlap: Number(amenity.allow_overlap) || 0
  };

  const [result] = await pool.execute(
    `INSERT INTO amenity_reservations
       (hotel_id, amenity_id, guest_name, guest_email, guest_phone,
        user_id, duration, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
    [
      amenity.hotel_id,
      amenity.id,
      guestName || null,
      user?.email || null,
      guestPhone,
      user?.id || null,
      durMin,
      'pending', // status inicial válido en el schema
      null  // ✅ notes is NULL, not JSON state
    ]
  );

  const draftId = result.insertId;
  
  // Store flow state in user_drafts table (only if user has valid ID)
  if (user?.id) {
    await upsertDraft(pool, user.id, {
      svc: 'amenity_flow',
      step: flowState.step,
      waiting: flowState.waiting,
      hotelId: hotelId,
      draft: JSON.stringify({ ...flowState, draftId })
    });
  } else {
    logger.warn({ 
      svc: 'amenity', 
      warn: 'createAmenityDraft_no_user_id', 
      draftId, 
      msg: 'Flow state cannot be stored in user_drafts without user ID' 
    });
  }
  
  return { id: draftId, notes: flowState };
}

export async function amenitySetEmail(pool, id, email) {
  await pool.execute(`UPDATE amenity_reservations SET guest_email=?, updated_at=DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id=?`, [email, id]);
}

export async function amenitySetScheduleAndParty(pool, id, { ymd, timeHHmm, partySize }) {
  // Use correct columns: reservation_date, reservation_time, party_size, duration
  // Don't use start_datetime (column doesn't exist)
  await pool.execute(
    `UPDATE amenity_reservations 
     SET reservation_date=?, reservation_time=?, party_size=?, updated_at=DATE_SUB(NOW(), INTERVAL 1 HOUR) 
     WHERE id=?`,
    [ymd, `${timeHHmm}:00`, partySize, id]
  );
}

export async function amenityUpdateNotes(pool, id, patch) {
  // Get user_id from the amenity reservation
  const [r] = await pool.execute(`SELECT user_id FROM amenity_reservations WHERE id=?`, [id]);
  const userId = r?.[0]?.user_id;
  
  if (!userId) {
    logger.warn({ svc: 'amenity', warn: 'amenityUpdateNotes_no_user_id', draftId: id });
    return;
  }
  
  // Get current flow state from user_drafts
  const currentDraft = await getDraft(pool, userId);
  const cur = safeJson(currentDraft?.draft);
  
  // Sanitize patch.step before merging
  if (patch && patch.step) {
    patch.step = sanitizeStepValue(patch.step);
  }
  
  const merged = { ...cur, ...(patch||{}), draftId: id };
  
  // Update user_drafts, not amenity_reservations.notes
  await upsertDraft(pool, userId, {
    svc: 'amenity_flow',
    step: merged.step,
    waiting: merged.waiting,
    hotelId: merged.hotelId || currentDraft?.hotelId || null,
    draft: JSON.stringify(merged)
  });
  
  // Update amenity_reservations timestamp only
  await pool.execute(`UPDATE amenity_reservations SET updated_at=DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id=?`, [id]);
}

function safeJson(s) {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

function sanitizeStepValue(step) {
  if (typeof step !== 'string') return null;
  let cleaned = step.replace(/→.*$/,'').replace(/_applied$/,'').trim();
  if (!cleaned) return null;
  return cleaned;
}

export function genAmenityCode() {
  const RANDOM_CODE_MIN = 1000;
  const RANDOM_CODE_RANGE = 9000;
  const now = new Date();
  const d = now.toISOString().slice(0,10).replace(/-/g,'');
  const r = Math.floor(Math.random() * RANDOM_CODE_RANGE) + RANDOM_CODE_MIN;
  return `AMN-${d}-${r}`;
}

export async function amenityConfirm(pool, id) {
  const code = genAmenityCode();
  await pool.execute(
    `UPDATE amenity_reservations SET status='confirmed', confirmation_code=?, updated_at=DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id=?`,
    [code, id]
  );
  return code;
}

export async function amenityCancel(pool, id) {
  await pool.execute(
    `UPDATE amenity_reservations SET status='cancelled', updated_at=DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id=?`,
    [id]
  );
}

export async function amenityGetLastDraft(pool, userId) {
  // Get draft ID from user_drafts
  const userDraft = await getDraft(pool, userId);
  if (!userDraft || userDraft.svc !== 'amenity_flow') {
    return null;
  }
  
  const flowState = safeJson(userDraft.draft);
  const draftId = flowState.draftId;
  
  if (!draftId) {
    // Draft exists but has no draftId - possibly corrupted state
    logger.warn({ 
      svc: 'amenity', 
      warn: 'amenityGetLastDraft_no_draftId', 
      userId, 
      hasDraft: !!userDraft.draft 
    });
    return null;
  }
  
  // Get the amenity reservation record
  const [rows] = await pool.execute(
    `SELECT * FROM amenity_reservations WHERE id=? AND user_id=? AND status='pending' LIMIT 1`,
    [draftId, userId]
  );
  
  if (!rows?.[0]) {
    // Draft ID exists but reservation not found - clean up orphaned draft
    logger.warn({ 
      svc: 'amenity', 
      warn: 'amenityGetLastDraft_reservation_not_found', 
      draftId, 
      userId 
    });
    return null;
  }
  
  // Attach flow state as notes for backward compatibility with amenities.flow.js
  return {
    ...rows[0],
    notes: JSON.stringify(flowState)
  };
}

export async function getPrimaryImageFor(pool, resourceType, resourceId) {
  const [rows] = await pool.execute(
    `SELECT image_path
     FROM resource_images
     WHERE resource_type=? AND resource_id=?
     ORDER BY is_primary DESC, display_order ASC, id ASC
     LIMIT 1`,
    [resourceType, resourceId]
  );
  return rows?.[0]?.image_path || null;
}

// Devuelve imágenes de resource_images para una amenidad, paginadas.
export async function listAmenityImages(pool, amenityId, { limit = 4, offset = 0 } = {}) {
  const [rows] = await pool.query(
    `SELECT image_path, is_primary, display_order, id
       FROM resource_images
      WHERE resource_type = 'amenity' AND resource_id = ?
      ORDER BY is_primary DESC, display_order ASC, id ASC
      LIMIT ? OFFSET ?`,
    [amenityId, limit, offset]
  );
  return rows;
}

// (Opcional) contar imágenes para saber si hay más
export async function countAmenityImages(pool, amenityId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
       FROM resource_images
      WHERE resource_type = 'amenity' AND resource_id = ?`,
    [amenityId]
  );
  return rows[0]?.n || 0;
}

// === Service Request functions ===

// Get last room label for a user - returns the room number/label from the rooms table
export async function getLastRoomLabelForUser(pool, { userId, hotelId }) {
  const sql = `
    SELECT rm.room_number
    FROM room_reservations rr
    LEFT JOIN rooms rm ON rm.id = rr.room_id
    WHERE rr.guest_id = ? AND rr.hotel_id = ?
    ORDER BY rr.created_at DESC
    LIMIT 1
  `;
  const [rows] = await pool.execute(sql, [userId, hotelId]);
  return rows?.[0]?.room_number || null;
}

// Insert a service request with proper field handling
export async function insertServiceRequest(pool, {
  hotelId,
  guestId,
  serviceTypeId,
  description,     // free text from user
  roomNumber,      // string (e.g. '202', 'Casa Blanca', etc.)
}) {
  // Get service name as "title"
  const [svcRows] = await pool.execute(
    'SELECT name FROM service_type_catalog WHERE id = ? LIMIT 1',
    [serviceTypeId]
  );
  const title = svcRows?.[0]?.name || null;

  const sql = `
    INSERT INTO service_requests
      (hotel_id, guest_id, service_type_id, title, description, priority, status, room_number, requested_at)
    VALUES
      (?,       ?,        ?,              ?,     ?,           NULL,     'pending', ?,           DATE_SUB(NOW(), INTERVAL 1 HOUR))
  `;
  const params = [hotelId, guestId, serviceTypeId, title, description || null, roomNumber || null];
  const [res] = await pool.execute(sql, params);
  return res.insertId;
}

// Lista tipos de servicio activos (por hotel)
export async function listActiveServiceTypes(pool, hotelId, limit = 10, offset = 0) {
  const [rows] = await pool.execute(
    `SELECT id, hotel_id, name, description, icon, is_active, sort_order
       FROM service_type_catalog
      WHERE hotel_id = ? AND is_active = 1
      ORDER BY sort_order ASC, id ASC
      LIMIT ? OFFSET ?`,
    [hotelId, limit, offset]
  );
  return rows;
}

// Obtiene tipo de servicio por id
export async function getServiceTypeById(pool, id) {
  const [rows] = await pool.execute(
    `SELECT id, hotel_id, name, description, icon, is_active
       FROM service_type_catalog
      WHERE id = ? AND is_active = 1
      LIMIT 1`,
    [id]
  );
  return rows?.[0] || null;
}

// Verifica si el usuario está hospedado actualmente
export async function isUserCurrentlyCheckedIn(pool, userId) {
  if (!userId) return false;

  // Caso 1: room_reservations con check_in/check_out
  if (await hasColumn(pool, 'room_reservations', 'check_in')) {
    const [r1] = await pool.execute(
      `SELECT COUNT(*) c
         FROM room_reservations
        WHERE guest_id = ?
          AND CURDATE() >= DATE(check_in)
          AND CURDATE() <  DATE(check_out)
          AND (status IS NULL OR status IN ('confirmed','checked_in','pending'))`,
      [userId]
    );
    if (r1[0].c > 0) return true;
  }

  // Caso 2: reservations con start_date/end_date
  if (await hasColumn(pool, 'reservations', 'start_date')) {
    const [r2] = await pool.execute(
      `SELECT COUNT(*) c
         FROM reservations
        WHERE user_id = ?
          AND CURDATE() >= DATE(start_date)
          AND CURDATE() <= DATE(end_date)
          AND (status IS NULL OR status IN ('confirmed','checked_in','pending'))`,
      [userId]
    );
    if (r2[0].c > 0) return true;
  }

  return false;
}

// Inserta una solicitud de servicio
export async function createServiceRequest(pool, payload) {
  const {
    hotelId,
    guestId,
    serviceTypeId,
    title,          // nombre del servicio
    description,    // texto del usuario (puede ser '')
    roomNumber      // nombre/numero habitación
  } = payload;

  const [res] = await pool.execute(
    `INSERT INTO service_requests
       (hotel_id, guest_id, assigned_to, title, service_type_id, description,
        priority, status, room_number, requested_at, completed_at)
     VALUES (?, ?, NULL, ?, ?, ?, NULL, 'pending', ?, DATE_SUB(NOW(), INTERVAL 1 HOUR), NULL)`,
    [hotelId, guestId || null, title, serviceTypeId, description || '', roomNumber || null]
  );

  return res.insertId;
}

// Service notes management - Using amenity_reservations notes pattern
export async function getServiceNotes(pool, userId) {
  if (!userId) return null;
  
  // We'll store service flow notes in a simple user_notes table or reuse amenity_reservations
  // For now, let's use a simple in-memory approach via amenity notes pattern
  // Check if there's a pending service draft
  const [rows] = await pool.execute(
    `SELECT notes FROM amenity_reservations 
     WHERE user_id=? AND status='service_draft' 
     ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  
  if (!rows?.[0]?.notes) return null;
  
  try {
    return JSON.parse(rows[0].notes);
  } catch {
    return null;
  }
}

/**
 * Helper function to get a placeholder amenity ID for service/table drafts.
 * Returns the ID of the first available amenity for the given hotel.
 * @param {Object} pool - Database connection pool
 * @param {number} hotelId - Hotel ID
 * @returns {Promise<number|undefined>} First amenity ID or undefined if none exist
 */
async function getPlaceholderAmenityId(pool, hotelId) {
  const [amenityRows] = await pool.execute(
    `SELECT id FROM amenities WHERE hotel_id=? LIMIT 1`,
    [hotelId]
  );
  return amenityRows?.[0]?.id;
}

export async function setServiceNotes(pool, userId, hotelId, notes) {
  if (!userId) return;
  
  // Check if there's already a service_draft
  const [existing] = await pool.execute(
    `SELECT id FROM amenity_reservations 
     WHERE user_id=? AND status='service_draft' 
     ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  
  const notesJson = JSON.stringify(notes);
  
  if (existing?.[0]?.id) {
    // Update existing
    await pool.execute(
      `UPDATE amenity_reservations 
       SET notes=?, updated_at=DATE_SUB(NOW(), INTERVAL 1 HOUR) 
       WHERE id=?`,
      [notesJson, existing[0].id]
    );
  } else {
    // Create new service draft - Use first available amenity as placeholder
    // This avoids "amenity_id cannot be null" errors if column has NOT NULL constraint
    const placeholderAmenityId = await getPlaceholderAmenityId(pool, hotelId);
    
    if (placeholderAmenityId == null) {
      // If no amenities exist, we can't create the draft
      logger.warn({ svc: 'service', warn: 'no_amenity_for_placeholder', userId, hotelId });
      return;
    }
    
    await pool.execute(
      `INSERT INTO amenity_reservations 
       (hotel_id, amenity_id, user_id, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, 'service_draft', ?, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
      [hotelId, placeholderAmenityId, userId, notesJson]
    );
  }
}

export async function clearServiceNotes(pool, userId) {
  if (!userId) return;
  
  await pool.execute(
    `DELETE FROM amenity_reservations 
     WHERE user_id=? AND status='service_draft'`,
    [userId]
  );
}

// === Table reservation functions ===

// Última habitación reservada por el usuario (por fecha más reciente)
// IMPORTANTE: rooms no tiene 'name'; usa 'room_number'
export async function getLastRoomForUser(pool, userId) {
  if (!userId) return null;
  
  const [rows] = await pool.execute(
    `
    SELECT
      rr.room_id,
      r.room_number AS roomNumber
    FROM room_reservations rr
    JOIN rooms r ON r.id = rr.room_id
    WHERE rr.guest_id = ?
    ORDER BY COALESCE(rr.updated_at, rr.created_at) DESC
    LIMIT 1
    `,
    [userId]
  );
  return rows[0] || null;
}

// Get user's last room number from room_reservations
export async function getUserLastRoomNumber(pool, userId) {
  if (!userId) return null;

  // Try to get room_number from the rooms table via room_id join
  const [rows] = await pool.execute(
    `SELECT r.room_number, rr.notes
       FROM room_reservations rr
       LEFT JOIN rooms r ON rr.room_id = r.id
      WHERE rr.guest_id = ?
      ORDER BY COALESCE(rr.updated_at, rr.created_at) DESC
      LIMIT 1`,
    [userId]
  );
  if (!rows?.length) return null;

  // First, try to get room_number from the rooms table
  if (rows[0].room_number) {
    return String(rows[0].room_number);
  }

  // Fallback: extract from notes field
  // Examples: 'Habitación: 3.' -> extract digits
  const raw = rows[0].notes || '';
  const m = String(raw).match(/Habitaci[oó]n:\s*(\d+)/i);
  return m ? m[1] : null;
}

// Create table reservation
export async function createTableReservation(pool, {
  hotelId, guest, dateISO, timeHHmm, partySize, notes
}) {
  const [res] = await pool.execute(
    `INSERT INTO table_reservations
      (hotel_id, table_id, guest_id, guest_name, guest_email, guest_phone,
       reservation_date, reservation_time, party_size, status, notes)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      hotelId,
      guest?.id || null,
      [guest?.first_name, guest?.last_name].filter(Boolean).join(' ').trim() || guest?.first_name || null,
      guest?.email || null,
      guest?.phone || null,
      dateISO,                 // 'YYYY-MM-DD'
      `${timeHHmm}:00`,        // 'HH:MM:SS'
      Number(partySize) || 1,
      notes || null,
    ]
  );
  return res.insertId;
}

// Table notes management - Using amenity_reservations notes pattern
export async function getTableNotes(pool, userId) {
  if (!userId) return null;
  
  const [rows] = await pool.execute(
    `SELECT notes FROM amenity_reservations 
     WHERE user_id=? AND status='table_draft' 
     ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  
  if (!rows?.[0]?.notes) return null;
  
  try {
    return JSON.parse(rows[0].notes);
  } catch {
    return null;
  }
}

export async function setTableNotes(pool, userId, hotelId, notes) {
  if (!userId) return;
  
  // Check if there's already a table_draft
  const [existing] = await pool.execute(
    `SELECT id FROM amenity_reservations 
     WHERE user_id=? AND status='table_draft' 
     ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  
  const notesJson = JSON.stringify(notes);
  
  if (existing?.[0]?.id) {
    // Update existing
    await pool.execute(
      `UPDATE amenity_reservations 
       SET notes=?, updated_at=DATE_SUB(NOW(), INTERVAL 1 HOUR) 
       WHERE id=?`,
      [notesJson, existing[0].id]
    );
  } else {
    // Create new table draft - Use first available amenity as placeholder
    // This avoids "amenity_id cannot be null" errors if column has NOT NULL constraint
    const placeholderAmenityId = await getPlaceholderAmenityId(pool, hotelId);
    
    if (placeholderAmenityId == null) {
      // If no amenities exist, we can't create the draft
      logger.warn({ svc: 'tables', warn: 'no_amenity_for_placeholder', userId, hotelId });
      return;
    }
    
    await pool.execute(
      `INSERT INTO amenity_reservations 
       (hotel_id, amenity_id, user_id, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, 'table_draft', ?, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
      [hotelId, placeholderAmenityId, userId, notesJson]
    );
  }
}

export async function clearTableNotes(pool, userId) {
  if (!userId) return;
  
  await pool.execute(
    `DELETE FROM amenity_reservations 
     WHERE user_id=? AND status='table_draft'`,
    [userId]
  );
}

// === Amenity reservation for guest (non-registered users) ===

/**
 * Build a confirmation code for amenity reservations
 * Format: AMN-YYYYMMDD-HHMM
 */
export function buildAmenityConfirmationCode() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `AMN-${yyyy}${mm}${dd}-${hh}${min}`;
}

/**
 * Insert amenity reservation for guest (non-registered user)
 * Only called when user confirms the reservation
 */
export async function insertAmenityReservationGuest(pool, data) {
  const {
    hotel_id,
    amenity_id,
    guest_name,
    guest_email = null,
    guest_phone = null,
    reservation_date,   // 'YYYY-MM-DD'
    reservation_time,   // 'HH:MM:00'
    duration,           // minutes
    party_size = null,
    status = 'pending',
    notes = null,
    special_requests = null
  } = data;

  // Validate required fields
  if (!hotel_id || !amenity_id || !guest_name || !reservation_date || !reservation_time || !duration) {
    throw new Error('missing_required_fields');
  }

  const confirmationCode = buildAmenityConfirmationCode();

  const [ins] = await pool.query(
    `INSERT INTO amenity_reservations
      (hotel_id, amenity_id, guest_name, guest_email, guest_phone,
       user_id, reservation_date, reservation_time, duration, party_size,
       status, notes, special_requests, confirmation_code, notification_sent, created_at)
     VALUES
      (?,        ?,          ?,          ?,           ?,
       NULL,     ?,               ?,              ?,        ?,
       ?,     ?,     ?,               ?,                 NULL,        DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
    [
      hotel_id, amenity_id, guest_name, guest_email, guest_phone,
      reservation_date, reservation_time, duration, party_size,
      status, notes, special_requests, confirmationCode
    ]
  );

  logger.info({ 
    svc: 'amenity_guest', 
    action: 'insertAmenityReservationGuest', 
    insertId: ins.insertId,
    confirmation_code: confirmationCode
  });

  return { id: ins.insertId, confirmation_code: confirmationCode };
}

// === Draft helpers (user_drafts table) ===

export async function getDraft(pool, userId) {
  if (!userId) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM user_drafts WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    return rows?.[0] || null;
  } catch (err) {
    logger.error({ svc: 'db', action: 'getDraft', error: err.message });
    return null;
  }
}

export async function upsertDraft(pool, userId, patch) {
  if (!userId) return;
  try {
    const current = await getDraft(pool, userId);
    const merged = { ...current, ...patch };
    
    const sql = `
      INSERT INTO user_drafts (user_id, svc, step, waiting, hotelId, draft, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 1 HOUR))
      ON DUPLICATE KEY UPDATE
        svc = VALUES(svc),
        step = VALUES(step),
        waiting = VALUES(waiting),
        hotelId = VALUES(hotelId),
        draft = VALUES(draft),
        updated_at = DATE_SUB(NOW(), INTERVAL 1 HOUR)
    `;
    
    await pool.execute(sql, [
      userId,
      merged.svc || null,
      merged.step || null,
      merged.waiting || null,
      merged.hotelId || null,
      merged.draft || null
    ]);
  } catch (err) {
    logger.error({ svc: 'db', action: 'upsertDraft', error: err.message });
  }
}

export async function clearDraft(pool, userId) {
  if (!userId) return;
  try {
    await pool.execute(`DELETE FROM user_drafts WHERE user_id = ?`, [userId]);
  } catch (err) {
    logger.error({ svc: 'db', action: 'clearDraft', error: err.message });
  }
}

// === New table reservation functions ===

// Get last guest contact by phone from room_reservations
export async function getLastGuestContactByPhone(pool, phone) {
  try {
    const clean = (phone || '').replace(/[^\d]/g, '');
    const [rows] = await pool.execute(
      `SELECT guest_email, guest_phone
         FROM room_reservations
        WHERE REPLACE(REPLACE(REPLACE(guest_phone,'+',''), ' ', ''), '-', '') = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      [clean]
    );
    return rows?.[0] || null;
  } catch (err) {
    logger.error({ svc: 'db', action: 'getLastGuestContactByPhone', error: err.message });
    return null;
  }
}

// Get last room reservation contact (email/phone) by userId or phone
export async function getLastRoomReservationContact(pool, userIdOrPhone) {
  try {
    const clean = String(userIdOrPhone || '').replace(/[^\d]/g, '');
    
    // Try phone-based lookup first (for phone numbers)
    if (clean.length >= 10) {
      const [rows] = await pool.execute(
        `SELECT guest_email, guest_phone
           FROM room_reservations
          WHERE REPLACE(REPLACE(REPLACE(guest_phone,'+',''), ' ', ''), '-', '') = ?
          ORDER BY created_at DESC
          LIMIT 1`,
        [clean]
      );
      if (rows?.[0]) return rows[0];
    }
    
    // Fallback: try email-based lookup (if input looks like email)
    if (String(userIdOrPhone).includes('@')) {
      const [rows] = await pool.execute(
        `SELECT guest_email, guest_phone
           FROM room_reservations
          WHERE guest_email = ?
          ORDER BY created_at DESC
          LIMIT 1`,
        [String(userIdOrPhone)]
      );
      if (rows?.[0]) return rows[0];
    }
    
    return {};
  } catch (err) {
    logger.error({ svc: 'db', action: 'getLastRoomReservationContact', error: err.message });
    return {};
  }
}

// Pick available table for hotel with capacity >= party size
export async function pickAvailableTableForHotel(pool, hotelId, partySize) {
  try {
    const [rows] = await pool.execute(
      `SELECT id
         FROM restaurant_tables
        WHERE hotel_id = ? AND status = 'available' AND capacity >= ?
        ORDER BY capacity ASC, id ASC
        LIMIT 1`,
      [hotelId, partySize || 1]
    );
    return rows?.[0]?.id || null;
  } catch (err) {
    logger.error({ svc: 'db', action: 'pickAvailableTableForHotel', error: err.message });
    return null;
  }
}

// Lista mesas del hotel_id (sólo disponibles)
export async function listTablesForHotel(pool, hotelId = 6) {
  logger.debug({ svc: 'db', action: 'listTablesForHotel', hotelId });
  try {
    const sql = `
      SELECT id, hotel_id, table_number, capacity, location, status, description
      FROM restaurant_tables
      WHERE hotel_id = ? AND status = 'available'
      ORDER BY id ASC
      LIMIT 25
    `;
    const [rows] = await pool.execute(sql, [hotelId]);
    logger.debug({ svc: 'db', action: 'listTablesForHotel', count: rows.length });
    return rows;
  } catch (err) {
    logger.error({ svc: 'db', action: 'listTablesForHotel', error: err.message });
    throw err;
  }
}

// Últimos datos de contacto del usuario desde room_reservations (fallback: table_reservations; fallback 2: users)
export async function getLastGuestContact(pool, userId) {
  logger.debug({ svc: 'db', action: 'getLastGuestContact', userId });
  try {
    let sql, rows;

    // Try room_reservations first
    sql = `
      SELECT guest_email, guest_phone
      FROM room_reservations
      WHERE guest_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `;
    [rows] = await pool.execute(sql, [userId]);
    if (rows?.[0]?.guest_email || rows?.[0]?.guest_phone) {
      logger.debug({ svc: 'db', action: 'getLastGuestContact', source: 'room_reservations' });
      return rows[0];
    }

    // Try table_reservations
    sql = `
      SELECT guest_email, guest_phone
      FROM table_reservations
      WHERE guest_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `;
    [rows] = await pool.execute(sql, [userId]);
    if (rows?.[0]?.guest_email || rows?.[0]?.guest_phone) {
      logger.debug({ svc: 'db', action: 'getLastGuestContact', source: 'table_reservations' });
      return rows[0];
    }

    // Fallback to users table
    sql = `
      SELECT email AS guest_email, phone AS guest_phone
      FROM users
      WHERE id = ?
      LIMIT 1
    `;
    [rows] = await pool.execute(sql, [userId]);
    logger.debug({ svc: 'db', action: 'getLastGuestContact', source: 'users' });
    return rows?.[0] || { guest_email: null, guest_phone: null };
  } catch (err) {
    logger.error({ svc: 'db', action: 'getLastGuestContact', error: err.message });
    return { guest_email: null, guest_phone: null };
  }
}

// Inserta la reserva de mesa (validar nulls). status = 'pending'
export async function insertTableReservation(pool, data) {
  logger.debug({
    svc: 'db',
    action: 'insertTableReservation',
    hotel_id: data.hotel_id,
    guest_id: data.guest_id,
    reservation_date: data.reservation_date,
    reservation_time: data.reservation_time,
    party_size: data.party_size
  });
  
  try {
    const sql = `
      INSERT INTO table_reservations
        (hotel_id, table_id, guest_id, guest_name, guest_email, guest_phone,
         reservation_date, reservation_time, party_size, status, notes, created_at)
      VALUES (?,?,?,?,?,?,?,?,?, 'pending', ?, DATE_SUB(NOW(), INTERVAL 1 HOUR))
    `;
    const params = [
      data.hotel_id,
      data.table_id || null,
      data.guest_id || null,
      data.guest_name || null,
      data.guest_email || null,
      data.guest_phone || null,
      data.reservation_date,     // 'YYYY-MM-DD'
      data.reservation_time,     // 'HH:MM:00'
      data.party_size,
      data.notes || null
    ];
    const [res] = await pool.execute(sql, params);
    logger.info({
      svc: 'db',
      action: 'insertTableReservation',
      insertId: res.insertId,
      guest_id: data.guest_id,
      reservation_date: data.reservation_date,
      party_size: data.party_size
    });
    return res.insertId;
  } catch (err) {
    logger.error({
      svc: 'db',
      action: 'insertTableReservation',
      error: err.message,
      code: err.code
    });
    throw err;
  }
}

// === Enolobot - Wine Purchase Functions ===

export async function createWineDraft(pool, { phone, step }) {
  try {
    const [result] = await pool.execute(
      `INSERT INTO wine_purchases (phone, step, created_at) VALUES (?, ?, NOW())`,
      [phone, step]
    );
    return { id: result.insertId, phone, step };
  } catch (err) {
    logger.error({ svc: 'db', action: 'createWineDraft', error: err.message });
    throw err;
  }
}

export async function getWineDraft(pool, phone) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM wine_purchases WHERE phone = ? AND status = 'draft' ORDER BY id DESC LIMIT 1`,
      [phone]
    );
    return rows[0] || null;
  } catch (err) {
    logger.error({ svc: 'db', action: 'getWineDraft', error: err.message });
    return null;
  }
}

export async function updateWineDraft(pool, id, updates) {
  try {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
    values.push(id);
    await pool.execute(
      `UPDATE wine_purchases SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  } catch (err) {
    logger.error({ svc: 'db', action: 'updateWineDraft', error: err.message });
    throw err;
  }
}

export async function listAvailableWines(pool) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM wines WHERE is_active = 1 ORDER BY display_order ASC, name ASC`
    );
    return rows;
  } catch (err) {
    logger.error({ svc: 'db', action: 'listAvailableWines', error: err.message });
    return [];
  }
}

export async function getWineById(pool, wineId) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM wines WHERE id = ?`,
      [wineId]
    );
    return rows[0] || null;
  } catch (err) {
    logger.error({ svc: 'db', action: 'getWineById', error: err.message });
    return null;
  }
}

export async function confirmWinePurchase(pool, draftId) {
  try {
    await pool.execute(
      `UPDATE wine_purchases SET status = 'confirmed', updated_at = NOW() WHERE id = ?`,
      [draftId]
    );
  } catch (err) {
    logger.error({ svc: 'db', action: 'confirmWinePurchase', error: err.message });
    throw err;
  }
}

export async function cancelWineDraft(pool, draftId) {
  try {
    await pool.execute(
      `UPDATE wine_purchases SET status = 'cancelled' WHERE id = ?`,
      [draftId]
    );
  } catch (err) {
    logger.error({ svc: 'db', action: 'cancelWineDraft', error: err.message });
    throw err;
  }
}

// === Enolobot - Vineyard Reservation Functions ===

export async function createVineyardReservationDraft(pool, { phone, step }) {
  try {
    const [result] = await pool.execute(
      `INSERT INTO vineyard_reservations (phone, step, created_at) VALUES (?, ?, NOW())`,
      [phone, step]
    );
    return { id: result.insertId, phone, step };
  } catch (err) {
    logger.error({ svc: 'db', action: 'createVineyardReservationDraft', error: err.message });
    throw err;
  }
}

export async function getVineyardReservationDraft(pool, phone) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM vineyard_reservations WHERE phone = ? AND status = 'draft' ORDER BY id DESC LIMIT 1`,
      [phone]
    );
    return rows[0] || null;
  } catch (err) {
    logger.error({ svc: 'db', action: 'getVineyardReservationDraft', error: err.message });
    return null;
  }
}

export async function updateVineyardReservationDraft(pool, id, updates) {
  try {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
    values.push(id);
    await pool.execute(
      `UPDATE vineyard_reservations SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  } catch (err) {
    logger.error({ svc: 'db', action: 'updateVineyardReservationDraft', error: err.message });
    throw err;
  }
}

export async function confirmVineyardReservation(pool, draftId) {
  try {
    await pool.execute(
      `UPDATE vineyard_reservations SET status = 'confirmed', updated_at = NOW() WHERE id = ?`,
      [draftId]
    );
  } catch (err) {
    logger.error({ svc: 'db', action: 'confirmVineyardReservation', error: err.message });
    throw err;
  }
}

export async function cancelVineyardReservationDraft(pool, draftId) {
  try {
    await pool.execute(
      `UPDATE vineyard_reservations SET status = 'cancelled' WHERE id = ?`,
      [draftId]
    );
  } catch (err) {
    logger.error({ svc: 'db', action: 'cancelVineyardReservationDraft', error: err.message });
    throw err;
  }
}

// === Enolobot - Contact Functions ===

export async function createContactDraft(pool, { phone, step }) {
  try {
    const [result] = await pool.execute(
      `INSERT INTO contact_requests (phone, step, created_at) VALUES (?, ?, NOW())`,
      [phone, step]
    );
    return { id: result.insertId, phone, step };
  } catch (err) {
    logger.error({ svc: 'db', action: 'createContactDraft', error: err.message });
    throw err;
  }
}

export async function getContactDraft(pool, phone) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM contact_requests WHERE phone = ? AND status = 'draft' ORDER BY id DESC LIMIT 1`,
      [phone]
    );
    return rows[0] || null;
  } catch (err) {
    logger.error({ svc: 'db', action: 'getContactDraft', error: err.message });
    return null;
  }
}

export async function updateContactDraft(pool, id, updates) {
  try {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
    values.push(id);
    await pool.execute(
      `UPDATE contact_requests SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  } catch (err) {
    logger.error({ svc: 'db', action: 'updateContactDraft', error: err.message });
    throw err;
  }
}

// === Enolobot - Private Events Functions ===

export async function createPrivateEventDraft(pool, { phone, step }) {
  try {
    const [result] = await pool.execute(
      `INSERT INTO private_event_requests (phone, step, created_at) VALUES (?, ?, NOW())`,
      [phone, step]
    );
    return { id: result.insertId, phone, step };
  } catch (err) {
    logger.error({ svc: 'db', action: 'createPrivateEventDraft', error: err.message });
    throw err;
  }
}

export async function getPrivateEventDraft(pool, phone) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM private_event_requests WHERE phone = ? AND status = 'draft' ORDER BY id DESC LIMIT 1`,
      [phone]
    );
    return rows[0] || null;
  } catch (err) {
    logger.error({ svc: 'db', action: 'getPrivateEventDraft', error: err.message });
    return null;
  }
}

export async function updatePrivateEventDraft(pool, id, updates) {
  try {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
    values.push(id);
    await pool.execute(
      `UPDATE private_event_requests SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  } catch (err) {
    logger.error({ svc: 'db', action: 'updatePrivateEventDraft', error: err.message });
    throw err;
  }
}

// === Enolobot - Wine Events (Catas/Vendimias) Functions ===

export async function createWineEventDraft(pool, { phone, step }) {
  try {
    const [result] = await pool.execute(
      `INSERT INTO wine_event_reservations (phone, step, created_at) VALUES (?, ?, NOW())`,
      [phone, step]
    );
    return { id: result.insertId, phone, step };
  } catch (err) {
    logger.error({ svc: 'db', action: 'createWineEventDraft', error: err.message });
    throw err;
  }
}

export async function getWineEventDraft(pool, phone) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM wine_event_reservations WHERE phone = ? AND status = 'draft' ORDER BY id DESC LIMIT 1`,
      [phone]
    );
    return rows[0] || null;
  } catch (err) {
    logger.error({ svc: 'db', action: 'getWineEventDraft', error: err.message });
    return null;
  }
}

export async function updateWineEventDraft(pool, id, updates) {
  try {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
    values.push(id);
    await pool.execute(
      `UPDATE wine_event_reservations SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  } catch (err) {
    logger.error({ svc: 'db', action: 'updateWineEventDraft', error: err.message });
    throw err;
  }
}

export async function listAvailableWineEvents(pool) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM wine_events WHERE is_active = 1 AND event_date >= CURDATE() ORDER BY event_date ASC LIMIT 10`
    );
    return rows;
  } catch (err) {
    logger.error({ svc: 'db', action: 'listAvailableWineEvents', error: err.message });
    return [];
  }
}

export async function getWineEventById(pool, eventId) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM wine_events WHERE id = ?`,
      [eventId]
    );
    return rows[0] || null;
  } catch (err) {
    logger.error({ svc: 'db', action: 'getWineEventById', error: err.message });
    return null;
  }
}

export async function confirmWineEventReservation(pool, draftId) {
  try {
    await pool.execute(
      `UPDATE wine_event_reservations SET status = 'confirmed', updated_at = NOW() WHERE id = ?`,
      [draftId]
    );
  } catch (err) {
    logger.error({ svc: 'db', action: 'confirmWineEventReservation', error: err.message });
    throw err;
  }
}

export async function cancelWineEventDraft(pool, draftId) {
  try {
    await pool.execute(
      `UPDATE wine_event_reservations SET status = 'cancelled' WHERE id = ?`,
      [draftId]
    );
  } catch (err) {
    logger.error({ svc: 'db', action: 'cancelWineEventDraft', error: err.message });
    throw err;
  }
}

// === Guest table reservation functions (for non-registered users) ===

/**
 * Build a confirmation code for table reservations
 * Format: TBL-YYYYMMDD-HHMM
 */
export function buildTableConfirmationCode(reservationDate, reservationTime) {
  const date = reservationDate.replace(/-/g, ''); // YYYYMMDD
  const time = reservationTime.slice(0, 5).replace(':', ''); // HHMM
  return `TBL-${date}-${time}`;
}

/**
 * Find an available table for the given hotel, date, time, and party size
 * Returns the first available table or null if none found
 */
export async function findAvailableTable(poolInstance, { hotel_id, reservation_date, reservation_time, party_size }) {
  try {
    // 1) Get tables with capacity >= party_size, enabled for the hotel
    const [tables] = await poolInstance.query(
      `SELECT id, capacity, status
         FROM restaurant_tables
        WHERE hotel_id = ? AND status = 'available' AND capacity >= ?
        ORDER BY capacity ASC, id ASC`,
      [hotel_id, party_size]
    );
    
    if (!tables.length) {
      logger.info({ svc: 'table_guest', action: 'findAvailableTable', status: 'no_tables_with_capacity', hotel_id, party_size });
      return null;
    }
    
    // 2) Filter out tables with overlapping reservations (within 2 hours window)
    // Consider states that block the table: pending, confirmed, seated
    for (const t of tables) {
      const [overlap] = await poolInstance.query(
        `SELECT id FROM table_reservations
          WHERE table_id = ?
            AND status IN ('pending','confirmed','seated')
            AND reservation_date = ?
            AND ABS(TIMESTAMPDIFF(MINUTE, reservation_time, ?)) < 120
          LIMIT 1`,
        [t.id, reservation_date, reservation_time]
      );
      
      if (!overlap.length) {
        logger.info({ svc: 'table_guest', action: 'findAvailableTable', status: 'found', table_id: t.id });
        return t; // This table is available
      }
    }
    
    logger.info({ svc: 'table_guest', action: 'findAvailableTable', status: 'all_tables_reserved', hotel_id, reservation_date, reservation_time });
    return null; // All tables are reserved
  } catch (err) {
    logger.error({ svc: 'table_guest', action: 'findAvailableTable', error: err.message });
    throw err;
  }
}

/**
 * Insert table reservation for guest (non-registered user)
 * Only called when user confirms the reservation
 */
export async function insertGuestTableReservation(poolInstance, data) {
  const {
    hotel_id,
    table_id,
    guest_name,
    guest_email = null,
    guest_phone = null,
    reservation_date,   // 'YYYY-MM-DD'
    reservation_time,   // 'HH:MM:00'
    party_size,
    notes = null,
    status = 'pending',
    special_requests = null  // Always NULL as per spec
  } = data;
  
  // Validate required fields
  if (!hotel_id || !table_id || !guest_name || !reservation_date || !reservation_time || !party_size) {
    throw new Error('missing_required_fields');
  }
  
  const confirmationCode = buildTableConfirmationCode(reservation_date, reservation_time);
  
  try {
    const [ins] = await poolInstance.query(
      `INSERT INTO table_reservations
        (hotel_id, table_id, guest_id, guest_name, guest_email, guest_phone,
         reservation_date, reservation_time, party_size, status,
         notification_sent, confirmation_code, email_confirmed, confirmed_at,
         notes, special_requests, created_at)
       VALUES
        (?, ?, NULL, ?, ?, ?,
         ?, ?, ?, ?,
         0, ?, 0, NULL,
         ?, NULL, DATE_SUB(NOW(), INTERVAL 1 HOUR))`,
      [
        hotel_id, table_id, guest_name, guest_email, guest_phone,
        reservation_date, reservation_time, party_size, status,
        confirmationCode,
        notes
      ]
    );
    
    logger.info({ 
      svc: 'table_guest', 
      action: 'insertGuestTableReservation', 
      insertId: ins.insertId,
      confirmation_code: confirmationCode,
      table_id,
      party_size
    });
    
    return { id: ins.insertId, confirmation_code: confirmationCode };
  } catch (err) {
    logger.error({ 
      svc: 'table_guest', 
      action: 'insertGuestTableReservation', 
      error: err.message,
      code: err.code 
    });
    throw err;
  }
}
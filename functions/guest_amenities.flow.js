// guest_amenities.flow.js - Amenity reservation flow for non-registered users (guests)
import { logger } from "./config.js";
import { 
  listAvailableAmenitiesForHotel,
  normalizePhoneMX,
  insertAmenityReservationGuest,
  getDraft,
  upsertDraft,
  clearDraft,
  getAmenityById
} from "./db.js";
import { 
  sendWhatsAppText, 
  sendImageWithCaption,
  sendInteractiveButtons,
  delay
} from "./wa.js";
import { 
  parseDMY2ToISO,
  isValidEmail,
  normalizeUserText,
  formatDateDMY2
} from "./price.js";
import { normalizeHHMM, isTimeInRange, isPastDateYMD, MSG_DATE_PAST, MX_TZ, parseDateInputWithRelative } from "./time_utils.js";
import { buildImageUrlFromConfig } from "./hotelconfig.js";

const PAGE_SIZE = 6; // Number of amenities to show per page
const AMENITY_DISPLAY_DELAY = 1500;

// === Helper functions ===

/**
 * Calculate duration in minutes from amenity block_duration_hours
 * Default to 120 minutes (2 hours) if not set or null
 */
function minutesFromAmenity(amenity) {
  const hours = Number(amenity?.block_duration_hours);
  return (hours && hours > 0) ? hours * 60 : 120;
}

/**
 * Format amenity caption for display
 */
function formatAmenityCaption(amenity) {
  const lines = [];
  lines.push(`*${amenity.name}*`);
  lines.push("");
  
  const open = amenity.opening_time ? String(amenity.opening_time).slice(0, 5) : null;
  const close = amenity.closing_time ? String(amenity.closing_time).slice(0, 5) : null;
  
  if (open && close) lines.push(`*Horario:* ${open}–${close}`);
  if (amenity.capacity) lines.push(`*Capacidad:* ${amenity.capacity}`);
  if (amenity.description) lines.push(`${amenity.description}`);
  
  return lines.join("\n");
}

/**
 * Send individual amenity card with image and selection button
 */
async function sendAmenityCard({ to, token, phoneNumberId }, amenity) {
  const caption = formatAmenityCaption(amenity);
  const imagePath = amenity.primary_image_path || null;
  const imageUrl = buildImageUrlFromConfig(imagePath);

  if (imageUrl) {
    try {
      await sendImageWithCaption({ to, imageUrl, caption, token, phoneNumberId });
    } catch {
      await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
    }
  } else {
    await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
  }

  const amenityId = amenity.id ?? amenity.amenity_id;
  if (!amenityId) {
    logger.error({ svc: 'amenity_guest', err: 'missing_amenity_id_on_button', raw: amenity });
    return;
  }
  
  const btnId = `amenityg:select:${amenityId}`;
  logger.info({ svc: 'amenity_guest', debug: 'send_button', btnId, amenityId, name: amenity.name });

  await sendInteractiveButtons({
    to,
    body: `¿Quieres seleccionar *${amenity.name}*?`,
    buttons: [{ id: btnId, title: 'Seleccionar' }],
    token,
    phoneNumberId
  });

  await delay(AMENITY_DISPLAY_DELAY);
}

// === Main flow functions ===

/**
 * Show paginated list of amenities for guest users
 * @param {Object} ctx - Context with to, token, phoneNumberId, pool
 */
export async function showGuestAmenitiesMenu(ctx) {
  const { to, token, phoneNumberId, pool } = ctx;
  
  try {
    logger.info({ svc: 'amenity_guest', step: 'start', to });
    
    // Always show page 0 initially
    await sendAmenityPage(ctx, 0);
  } catch (err) {
    logger.error('[amenity_guest] showGuestAmenitiesMenu failed', { 
      message: err.message, 
      code: err.code, 
      sqlMessage: err.sqlMessage 
    });
    await sendWhatsAppText({
      to,
      text: 'No pude listar las amenidades. Inténtalo de nuevo.',
      token,
      phoneNumberId
    });
  }
}

/**
 * Send a specific page of amenities
 */
async function sendAmenityPage(ctx, page = 0) {
  const { to, token, phoneNumberId, pool } = ctx;
  const hotelId = 6; // Fixed hotel ID as per requirements
  const offset = page * PAGE_SIZE;
  
  const items = await listAvailableAmenitiesForHotel(pool, hotelId, { limit: PAGE_SIZE, offset });
  
  logger.info('[amenity_guest] fetched', { count: items.length, page, hotelId });
  
  if (!items.length) {
    if (page === 0) {
      await sendWhatsAppText({
        to,
        text: 'No hay amenidades disponibles por el momento.',
        token,
        phoneNumberId
      });
    } else {
      await sendWhatsAppText({
        to,
        text: 'No hay más amenidades.',
        token,
        phoneNumberId
      });
    }
    return;
  }

  // Send each amenity with image
  for (const a of items) {
    await sendAmenityCard({ to, token, phoneNumberId }, a);
  }

  // Check if there are more amenities
  const maybeMore = await listAvailableAmenitiesForHotel(pool, hotelId, { limit: 1, offset: offset + PAGE_SIZE });
  const hasMore = maybeMore.length > 0;
  
  logger.info({ svc: 'amenity_guest', action: 'checkMore', page, hasMore });
  
  if (hasMore) {
    // Send "Ver más" button
    const msg = '¿Quieres ver más amenidades?';
    const buttons = [{ id: `amenityg:more:${page + 1}`, title: 'Ver más' }];
    await sendInteractiveButtons({ to, body: msg, buttons, token, phoneNumberId });
  }
}

/**
 * Handle postback actions for guest amenity flow
 * @param {Object} ctx - Context with to, token, phoneNumberId, pool, from
 * @param {string} payload - Button payload
 */
export async function handleGuestAmenitiesPostback(ctx, payload) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  logger.info({ svc: 'amenity_guest', action: 'handlePostback', payload, to });
  
  // Handle pagination: amenityg:more:<page>
  if (payload.startsWith('amenityg:more:')) {
    const pageMatch = /^amenityg:more:(\d+)$/.exec(payload);
    if (pageMatch) {
      const nextPage = parseInt(pageMatch[1], 10) || 0;
      logger.info({ svc: 'amenity_guest', action: 'handleMore', nextPage });
      await sendAmenityPage(ctx, nextPage);
      return true;
    }
  }
  
  // Handle amenity selection: amenityg:select:<amenityId>
  if (payload.startsWith('amenityg:select:')) {
    const selectMatch = /^amenityg:select:(\d+)$/.exec(payload);
    if (selectMatch) {
      const amenityId = parseInt(selectMatch[1], 10);
      await handleAmenitySelection(ctx, amenityId);
      return true;
    }
  }
  
  // Handle confirm: amenityg:confirm
  if (payload === 'amenityg:confirm') {
    await handleConfirm(ctx);
    return true;
  }
  
  // Handle edit date/time: amenityg:edit:date
  if (payload === 'amenityg:edit:date') {
    await handleEditDate(ctx);
    return true;
  }
  
  // Handle cancel: amenityg:cancel
  if (payload === 'amenityg:cancel') {
    await handleCancel(ctx);
    return true;
  }
  
  return false;
}

/**
 * Handle amenity selection - start the reservation flow
 */
async function handleAmenitySelection(ctx, amenityId) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  try {
    // Get amenity details
    const amenity = await getAmenityById(pool, amenityId);
    if (!amenity) {
      logger.error({ svc: 'amenity_guest', err: 'amenity_not_found', amenityId });
      await sendWhatsAppText({ to, text: 'No encontré la amenidad seleccionada.', token, phoneNumberId });
      return;
    }
    
    // Normalize phone to E.164 format
    const guestPhone = normalizePhoneMX(from);
    const duration = minutesFromAmenity(amenity);
    
    // Create draft state (no user_id since this is for non-registered users)
    // We'll store this in memory or a temporary storage mechanism
    // For now, we'll use a simple approach with a phone-based key
    const draft = {
      kind: 'amenity_guest',
      step: 'ask_name',
      hotel_id: 6,
      amenity_id: amenityId,
      amenity_name: amenity.name,
      guest_phone: guestPhone,
      duration: duration,
      opening_time: amenity.opening_time || null,
      closing_time: amenity.closing_time || null
    };
    
    // Store draft using phone as key (since no user_id)
    // We'll need to create a temporary storage mechanism
    await storeGuestDraft(pool, from, draft);
    
    logger.info('[amenity_guest] select', { amenity_id: amenityId, phone: guestPhone });
    
    // Ask for name
    await sendWhatsAppText({
      to,
      text: '¿Cuál es tu *nombre completo*?',
      token,
      phoneNumberId
    });
  } catch (err) {
    logger.error('[amenity_guest] error', { step: 'select', err: err.message });
    await sendWhatsAppText({ to, text: 'Ocurrió un error al seleccionar la amenidad.', token, phoneNumberId });
  }
}

/**
 * Handle text input based on current step
 * @param {Object} ctx - Context with to, token, phoneNumberId, pool, from
 * @param {string} text - User input text
 */
export async function handleGuestAmenitiesText(ctx, text) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  // Get current draft
  const draft = await getGuestDraft(pool, from);
  if (!draft || draft.kind !== 'amenity_guest') {
    return false; // Not in guest amenity flow
  }
  
  const step = draft.step;
  const txtNorm = normalizeUserText(text);
  
  logger.info({ svc: 'amenity_guest', debug: 'text_in', step, text: txtNorm });
  
  try {
    switch (step) {
      case 'ask_name':
        await handleNameInput(ctx, draft, txtNorm);
        return true;
        
      case 'ask_email':
        await handleEmailInput(ctx, draft, txtNorm);
        return true;
        
      case 'ask_date':
        await handleDateInput(ctx, draft, txtNorm);
        return true;
        
      case 'ask_time':
        await handleTimeInput(ctx, draft, txtNorm);
        return true;
        
      case 'ask_party':
        await handlePartyInput(ctx, draft, txtNorm);
        return true;
        
      default:
        return false;
    }
  } catch (err) {
    logger.error('[amenity_guest] error', { step, err: err.message });
    await sendWhatsAppText({ to, text: 'Ocurrió un error. Intenta de nuevo.', token, phoneNumberId });
    return true;
  }
}

/**
 * Handle name input
 */
async function handleNameInput(ctx, draft, name) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  // Validate name (letters and spaces, 2-60 chars)
  if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{2,60}$/.test(name)) {
    await sendWhatsAppText({
      to,
      text: 'Nombre inválido. Debe contener solo letras y espacios (2-60 caracteres).',
      token,
      phoneNumberId
    });
    return;
  }
  
  // Update draft
  draft.guest_name = name;
  draft.step = 'ask_email';
  await storeGuestDraft(pool, from, draft);
  
  // Ask for email
  await sendWhatsAppText({
    to,
    text: 'Escribe tu *correo electrónico* (ej.: nombre@dominio.com).',
    token,
    phoneNumberId
  });
}

/**
 * Handle email input
 */
async function handleEmailInput(ctx, draft, email) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  // Validate email
  if (!isValidEmail(email)) {
    await sendWhatsAppText({
      to,
      text: 'Correo inválido. Intenta de nuevo (ej.: usuario@dominio.com).',
      token,
      phoneNumberId
    });
    return;
  }
  
  // Update draft
  draft.guest_email = email;
  draft.step = 'ask_date';
  await storeGuestDraft(pool, from, draft);
  
  // Ask for date
  await sendWhatsAppText({
    to,
    text: '¿Qué *fecha* quieres? (DD/MM/AA)\nEjemplo: *09/12/26*',
    token,
    phoneNumberId
  });
}

/**
 * Handle date input
 */
async function handleDateInput(ctx, draft, dateText) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  // Parse date - try with relative dates first
  let iso = parseDateInputWithRelative(dateText, MX_TZ);
  if (!iso) {
    // Fallback to old parser
    iso = parseDMY2ToISO(dateText);
  }
  
  if (!iso) {
    await sendWhatsAppText({
      to,
      text: 'Formato inválido. Usa *DD/MM/AA* o escribe *hoy* / *mañana*. Ejemplo: *17/10/25*',
      token,
      phoneNumberId
    });
    return;
  }
  
  // Validate date is not in the past
  if (isPastDateYMD(iso, MX_TZ)) {
    await sendWhatsAppText({ to, text: MSG_DATE_PAST(), token, phoneNumberId });
    await sendWhatsAppText({
      to,
      text: '¿Qué *fecha* quieres? (DD/MM/AA)\nEjemplo: *09/12/26*',
      token,
      phoneNumberId
    });
    return;
  }
  
  // Update draft
  draft.reservation_date = iso;
  draft.step = 'ask_time';
  await storeGuestDraft(pool, from, draft);
  
  // Ask for time
  const open = draft.opening_time ? String(draft.opening_time).slice(0, 5) : '00:00';
  const close = draft.closing_time ? String(draft.closing_time).slice(0, 5) : '23:59';
  
  if (draft.opening_time && draft.closing_time) {
    await sendWhatsAppText({
      to,
      text: `¿A qué *hora*? (HH:MM 24h)\nHorario válido: *${open} a ${close}*\nEjemplo: *12:00*`,
      token,
      phoneNumberId
    });
  } else {
    await sendWhatsAppText({
      to,
      text: '¿A qué *hora*? (HH:MM 24h)\nEjemplo: *12:00*',
      token,
      phoneNumberId
    });
  }
}

/**
 * Handle time input
 */
async function handleTimeInput(ctx, draft, timeText) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  // Normalize time
  const hhmm = normalizeHHMM(timeText);
  if (!hhmm) {
    await sendWhatsAppText({
      to,
      text: 'Formato inválido. Usa *HH:MM* (24h). Ejemplo: *12:00*',
      token,
      phoneNumberId
    });
    return;
  }
  
  // Validate time is within range if opening/closing times exist
  if (draft.opening_time && draft.closing_time) {
    const open = String(draft.opening_time).slice(0, 5);
    const close = String(draft.closing_time).slice(0, 5);
    
    if (!isTimeInRange(hhmm, open, close)) {
      const closeDisplay = close === '00:00' ? '24:00' : close;
      await sendWhatsAppText({
        to,
        text: `Fuera de horario. Válido: *${open}–${closeDisplay}*.\nEjemplo: *12:00*`,
        token,
        phoneNumberId
      });
      return;
    }
  }
  
  // Update draft
  draft.reservation_time = `${hhmm}:00`;
  draft.step = 'ask_party';
  await storeGuestDraft(pool, from, draft);
  
  // Ask for party size
  await sendWhatsAppText({
    to,
    text: '¿Para cuántas *personas* sería?\nTen en cuenta la capacidad de la amenidad.',
    token,
    phoneNumberId
  });
}

/**
 * Handle party size input
 */
async function handlePartyInput(ctx, draft, partyText) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  // Extract number
  const digits = String(partyText || '').match(/\d+/);
  const n = digits ? Number(digits[0]) : NaN;
  
  // Validate: must be integer 1-99
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    await sendWhatsAppText({
      to,
      text: 'Cantidad inválida. Debe ser un número entre *1 y 99*.',
      token,
      phoneNumberId
    });
    return;
  }
  
  // Update draft
  draft.party_size = n;
  draft.step = 'confirm';
  await storeGuestDraft(pool, from, draft);
  
  // Show confirmation summary
  const resumen =
    `*Confirma tus datos de reserva:*\n\n` +
    `*Nombre:* ${draft.guest_name}\n` +
    `*Email:* ${draft.guest_email}\n` +
    `*Amenidad:* ${draft.amenity_name}\n` +
    `*Fecha:* ${formatDateDMY2(draft.reservation_date)}\n` +
    `*Hora:* ${draft.reservation_time.slice(0, 5)}\n` +
    `*Personas:* ${n}`;
  
  await sendWhatsAppText({ to, text: resumen, token, phoneNumberId });
  
  await sendInteractiveButtons({
    to,
    body: '¿Confirmas tu reserva?',
    buttons: [
      { id: 'amenityg:confirm', title: 'Confirmar' },
      { id: 'amenityg:edit:date', title: 'Editar fecha/hora' },
      { id: 'amenityg:cancel', title: 'Cancelar' }
    ],
    token,
    phoneNumberId
  });
}

/**
 * Handle confirm action
 */
async function handleConfirm(ctx) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  try {
    const draft = await getGuestDraft(pool, from);
    if (!draft || draft.kind !== 'amenity_guest' || draft.step !== 'confirm') {
      await sendWhatsAppText({ to, text: 'Sesión expirada. Escribe "hola" para comenzar de nuevo.', token, phoneNumberId });
      return;
    }
    
    // Insert reservation
    const result = await insertAmenityReservationGuest(pool, {
      hotel_id: draft.hotel_id,
      amenity_id: draft.amenity_id,
      guest_name: draft.guest_name,
      guest_email: draft.guest_email,
      guest_phone: draft.guest_phone,
      reservation_date: draft.reservation_date,
      reservation_time: draft.reservation_time,
      duration: draft.duration,
      party_size: draft.party_size,
      status: 'pending',
      notes: null,
      special_requests: null
    });
    
    logger.info('[amenity_guest] confirm', { reservation_id: result.id });
    
    // Clear draft
    await clearGuestDraft(pool, from);
    
    // Send success message
    await sendWhatsAppText({
      to,
      text: '✅ Reserva de amenidad registrada exitosamente.\n\nRecibirás confirmación por correo.\n\nEscribe *hola* para volver al inicio.',
      token,
      phoneNumberId
    });
  } catch (err) {
    logger.error('[amenity_guest] error', { step: 'confirm', err: err.message });
    await sendWhatsAppText({ to, text: 'No pudimos confirmar en este momento. Intenta de nuevo.', token, phoneNumberId });
  }
}

/**
 * Handle edit date action
 */
async function handleEditDate(ctx) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  try {
    const draft = await getGuestDraft(pool, from);
    if (!draft || draft.kind !== 'amenity_guest') {
      await sendWhatsAppText({ to, text: 'Sesión expirada. Escribe "hola" para comenzar de nuevo.', token, phoneNumberId });
      return;
    }
    
    // Go back to ask_date step
    draft.step = 'ask_date';
    await storeGuestDraft(pool, from, draft);
    
    await sendWhatsAppText({
      to,
      text: '¿Qué *fecha* quieres? (DD/MM/AA)\nEjemplo: *17/10/25*',
      token,
      phoneNumberId
    });
  } catch (err) {
    logger.error('[amenity_guest] error', { step: 'edit_date', err: err.message });
    await sendWhatsAppText({ to, text: 'Ocurrió un error. Intenta de nuevo.', token, phoneNumberId });
  }
}

/**
 * Handle cancel action
 */
async function handleCancel(ctx) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  try {
    // Clear draft
    await clearGuestDraft(pool, from);
    
    logger.info('[amenity_guest] cancel', { phone: from });
    
    await sendWhatsAppText({
      to,
      text: 'Se canceló la operación. Escribe *hola* para volver al inicio.',
      token,
      phoneNumberId
    });
  } catch (err) {
    logger.error('[amenity_guest] error', { step: 'cancel', err: err.message });
    await sendWhatsAppText({ to, text: 'Ocurrió un error al cancelar.', token, phoneNumberId });
  }
}

// === Draft storage helpers ===
// Since guest users don't have user_id, we'll store drafts using phone as key
// We'll use a simple table or memory-based approach

/**
 * Store guest draft using phone as key
 */
async function storeGuestDraft(pool, phone, draft) {
  const normPhone = normalizePhoneMX(phone);
  const draftJson = JSON.stringify(draft);
  
  try {
    // Use user_drafts table with phone as a pseudo user_id
    // We'll use a negative ID or special marker for guest drafts
    // For simplicity, we'll store in a temporary way using the draft field
    await pool.execute(
      `INSERT INTO user_drafts (user_id, svc, step, draft, updated_at)
       VALUES (0, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 1 HOUR))
       ON DUPLICATE KEY UPDATE
         svc = VALUES(svc),
         step = VALUES(step),
         draft = VALUES(draft),
         updated_at = DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      ['amenity_guest_' + normPhone, draft.step, draftJson]
    );
  } catch (err) {
    logger.error('[amenity_guest] storeGuestDraft error', { err: err.message });
    throw err;
  }
}

/**
 * Get guest draft by phone
 */
async function getGuestDraft(pool, phone) {
  const normPhone = normalizePhoneMX(phone);
  
  try {
    const [rows] = await pool.execute(
      `SELECT draft FROM user_drafts WHERE svc = ? AND user_id = 0 LIMIT 1`,
      ['amenity_guest_' + normPhone]
    );
    
    if (!rows?.[0]?.draft) return null;
    
    return JSON.parse(rows[0].draft);
  } catch (err) {
    logger.error('[amenity_guest] getGuestDraft error', { err: err.message });
    return null;
  }
}

/**
 * Clear guest draft by phone
 */
async function clearGuestDraft(pool, phone) {
  const normPhone = normalizePhoneMX(phone);
  
  try {
    await pool.execute(
      `DELETE FROM user_drafts WHERE svc = ? AND user_id = 0`,
      ['amenity_guest_' + normPhone]
    );
  } catch (err) {
    logger.error('[amenity_guest] clearGuestDraft error', { err: err.message });
  }
}
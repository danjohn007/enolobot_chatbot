// guest_tables.flow.js - Table reservation flow for non-registered users (guests)
import { logger } from "./config.js";
import {
  normalizePhoneMX,
  findAvailableTable,
  insertGuestTableReservation
} from "./db.js";
import {
  sendWhatsAppText,
  sendInteractiveButtons
} from "./wa.js";
import {
  parseDMY2ToISO,
  isValidEmail,
  normalizeUserText,
  formatDateDMY2
} from "./price.js";
import { normalizeHHMM, isPastDateYMD, MSG_DATE_PAST, MX_TZ, parseDateInputWithRelative } from "./time_utils.js";

// === Helper functions ===

/**
 * Validate name: only letters and spaces, 2-60 characters
 */
function isValidName(name) {
  return /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]{2,60}$/.test(name);
}

/**
 * Validate party size: integer between 1 and 99
 */
function isPositiveInt(value, min = 1, max = 99) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}

// === Draft storage helpers ===
// Since guest users don't have user_id, we'll store drafts using phone as key

/**
 * Store guest table draft using phone as key
 */
async function storeGuestTableDraft(pool, phone, draft) {
  const normPhone = normalizePhoneMX(phone);
  const draftJson = JSON.stringify(draft);
  
  try {
    await pool.execute(
      `INSERT INTO user_drafts (user_id, svc, step, draft, updated_at)
       VALUES (0, ?, ?, ?, DATE_SUB(NOW(), INTERVAL 1 HOUR))
       ON DUPLICATE KEY UPDATE
         svc = VALUES(svc),
         step = VALUES(step),
         draft = VALUES(draft),
         updated_at = DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      ['table_guest_' + normPhone, draft.step, draftJson]
    );
  } catch (err) {
    logger.error('[table_guest] storeGuestTableDraft error', { err: err.message });
    throw err;
  }
}

/**
 * Get guest table draft by phone
 */
async function getGuestTableDraft(pool, phone) {
  const normPhone = normalizePhoneMX(phone);
  
  try {
    const [rows] = await pool.execute(
      `SELECT draft FROM user_drafts WHERE svc = ? AND user_id = 0 LIMIT 1`,
      ['table_guest_' + normPhone]
    );
    
    if (!rows?.[0]?.draft) return null;
    
    return JSON.parse(rows[0].draft);
  } catch (err) {
    logger.error('[table_guest] getGuestTableDraft error', { err: err.message });
    return null;
  }
}

/**
 * Clear guest table draft by phone
 */
async function clearGuestTableDraft(pool, phone) {
  const normPhone = normalizePhoneMX(phone);
  
  try {
    await pool.execute(
      `DELETE FROM user_drafts WHERE svc = ? AND user_id = 0`,
      ['table_guest_' + normPhone]
    );
  } catch (err) {
    logger.error('[table_guest] clearGuestTableDraft error', { err: err.message });
  }
}

// === Main flow functions ===

/**
 * Start guest table reservation flow
 * Entry point from "Reservar Mesa" button for non-registered users
 */
export async function startGuestTableFlow(ctx) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  try {
    logger.info({ svc: 'table_guest', step: 'start', phone: from });
    
    // Create draft with initial state
    const guestPhone = normalizePhoneMX(from);
    const draft = {
      kind: 'table_guest',
      step: 'ask_name',
      hotel_id: 6,
      guest_phone: guestPhone
    };
    
    await storeGuestTableDraft(pool, from, draft);
    
    // Ask for name
    await sendWhatsAppText({
      to,
      text: '¿Cuál es tu *nombre completo*?',
      token,
      phoneNumberId
    });
  } catch (err) {
    logger.error('[table_guest] error', { step: 'start', err: err.message });
    await sendWhatsAppText({ 
      to, 
      text: 'Ocurrió un error al iniciar la reserva. Intenta de nuevo.', 
      token, 
      phoneNumberId 
    });
  }
}

/**
 * Handle text input based on current step
 */
export async function handleGuestTablesText(ctx, text) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  // Get current draft
  const draft = await getGuestTableDraft(pool, from);
  if (!draft || draft.kind !== 'table_guest') {
    return false; // Not in guest table flow
  }
  
  const step = draft.step;
  const txtNorm = normalizeUserText(text);
  
  logger.info({ svc: 'table_guest', debug: 'text_in', step, text: txtNorm });
  
  try {
    switch (step) {
      case 'ask_name':
        await handleNameInput(ctx, draft, txtNorm, pool, from);
        return true;
        
      case 'ask_email':
        await handleEmailInput(ctx, draft, txtNorm, pool, from);
        return true;
        
      case 'ask_date':
        await handleDateInput(ctx, draft, txtNorm, pool, from);
        return true;
        
      case 'ask_time':
        await handleTimeInput(ctx, draft, txtNorm, pool, from);
        return true;
        
      case 'ask_party':
        await handlePartyInput(ctx, draft, txtNorm, pool, from);
        return true;
        
      case 'ask_notes':
        await handleNotesInput(ctx, draft, txtNorm, pool, from);
        return true;
        
      case 'confirm':
        // Allow text shortcuts for confirmation
        const lowerText = txtNorm.toLowerCase();
        if (lowerText === 'confirmar') {
          await handleConfirm(ctx, pool, from);
          return true;
        } else if (lowerText === 'editar' || lowerText === 'editar datos') {
          await handleEdit(ctx, pool, from);
          return true;
        } else if (lowerText === 'cancelar') {
          await handleCancel(ctx, pool, from);
          return true;
        }
        // Otherwise, ask them to use buttons
        await sendWhatsAppText({
          to,
          text: 'Por favor, usa los botones para confirmar, editar o cancelar.',
          token,
          phoneNumberId
        });
        return true;
        
      default:
        return false;
    }
  } catch (err) {
    logger.error('[table_guest] error', { step, err: err.message });
    await sendWhatsAppText({ 
      to, 
      text: 'Ocurrió un error. Intenta de nuevo.', 
      token, 
      phoneNumberId 
    });
    return true;
  }
}

/**
 * Handle name input
 */
async function handleNameInput(ctx, draft, name, pool, from) {
  const { to, token, phoneNumberId } = ctx;
  
  // Validate name
  if (!isValidName(name)) {
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
  await storeGuestTableDraft(pool, from, draft);
  
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
async function handleEmailInput(ctx, draft, email, pool, from) {
  const { to, token, phoneNumberId } = ctx;
  
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
  await storeGuestTableDraft(pool, from, draft);
  
  // Ask for date
  await sendWhatsAppText({
    to,
    text: '¿Qué *fecha* quieres reservar? (DD/MM/AA)\nEjemplo: *09/12/26*',
    token,
    phoneNumberId
  });
}

/**
 * Handle date input
 */
async function handleDateInput(ctx, draft, dateText, pool, from) {
  const { to, token, phoneNumberId } = ctx;
  
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
      text: '¿Qué *fecha* quieres reservar? (DD/MM/AA)\nEjemplo: *09/12/26*',
      token,
      phoneNumberId
    });
    return;
  }
  
  // Update draft
  draft.reservation_date = iso;
  draft.step = 'ask_time';
  await storeGuestTableDraft(pool, from, draft);
  
  // Ask for time
  await sendWhatsAppText({
    to,
    text: '¿A qué *hora*? (HH:MM formato 24h)\nEjemplo: *13:00*',
    token,
    phoneNumberId
  });
}

/**
 * Handle time input
 */
async function handleTimeInput(ctx, draft, timeText, pool, from) {
  const { to, token, phoneNumberId } = ctx;
  
  // Normalize time
  const hhmm = normalizeHHMM(timeText);
  if (!hhmm) {
    await sendWhatsAppText({
      to,
      text: 'Formato inválido. Usa *HH:MM* (24h). Ejemplo: *13:00*',
      token,
      phoneNumberId
    });
    return;
  }
  
  // Update draft
  draft.reservation_time = `${hhmm}:00`;
  draft.step = 'ask_party';
  await storeGuestTableDraft(pool, from, draft);
  
  // Ask for party size
  await sendWhatsAppText({
    to,
    text: '¿Para cuántas *personas* es la reserva de mesa?',
    token,
    phoneNumberId
  });
}

/**
 * Handle party size input
 */
async function handlePartyInput(ctx, draft, partyText, pool, from) {
  const { to, token, phoneNumberId } = ctx;
  
  // Extract number
  const digits = String(partyText || '').match(/\d+/);
  const n = digits ? Number(digits[0]) : NaN;
  
  // Validate: must be integer 1-99
  if (!isPositiveInt(n, 1, 99)) {
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
  draft.step = 'ask_notes';
  await storeGuestTableDraft(pool, from, draft);
  
  // Ask for notes (optional)
  await sendWhatsAppText({
    to,
    text: '¿Alguna *nota o comentario* especial? (opcional)\nSi no es necesario, escribe *Ninguno* o *No*',
    token,
    phoneNumberId
  });
}

/**
 * Handle notes input
 */
async function handleNotesInput(ctx, draft, notesText, pool, from) {
  const { to, token, phoneNumberId } = ctx;
  
  // Notes are optional - treat "-" or empty as no notes
  const notes = (notesText === '-' || !notesText.trim()) ? null : notesText.trim();
  
  // Update draft
  draft.notes = notes;
  draft.step = 'confirm';
  await storeGuestTableDraft(pool, from, draft);
  
  // Show confirmation summary
  const dateDisplay = formatDateDMY2(draft.reservation_date);
  const timeDisplay = draft.reservation_time.slice(0, 5);
  
  const resumen =
    `Confirma tu reserva de mesa:\n\n` +
    `• *Nombre:* ${draft.guest_name}\n` +
    `• *Email:* ${draft.guest_email}\n` +
    `• *Fecha:* ${dateDisplay}\n` +
    `• *Hora:* ${timeDisplay}\n` +
    `• *Personas:* ${draft.party_size}\n` +
    `• *Notas:* ${notes || '—'}`;
  
  await sendWhatsAppText({ to, text: resumen, token, phoneNumberId });
  
  await sendInteractiveButtons({
    to,
    body: '¿Deseas continuar?',
    buttons: [
      { id: 'tableg:confirm', title: 'Confirmar' },
      { id: 'tableg:edit', title: 'Editar datos' },
      { id: 'tableg:cancel', title: 'Cancelar' }
    ],
    token,
    phoneNumberId
  });
}

/**
 * Handle postback actions (confirm, edit, cancel)
 */
export async function handleGuestTablesPostback(ctx, payload) {
  const { to, token, phoneNumberId, pool, from } = ctx;
  
  logger.info({ svc: 'table_guest', action: 'handlePostback', payload, to });
  
  if (payload === 'tableg:confirm') {
    await handleConfirm(ctx, pool, from);
    return true;
  }
  
  if (payload === 'tableg:edit') {
    await handleEdit(ctx, pool, from);
    return true;
  }
  
  if (payload === 'tableg:cancel') {
    await handleCancel(ctx, pool, from);
    return true;
  }
  
  return false;
}

/**
 * Handle confirm action
 */
async function handleConfirm(ctx, pool, from) {
  const { to, token, phoneNumberId } = ctx;
  
  try {
    const draft = await getGuestTableDraft(pool, from);
    if (!draft || draft.kind !== 'table_guest' || draft.step !== 'confirm') {
      await sendWhatsAppText({ 
        to, 
        text: 'Sesión expirada. Escribe "hola" para comenzar de nuevo.', 
        token, 
        phoneNumberId 
      });
      return;
    }
    
    // Revalidate required fields
    if (!draft.guest_name || !draft.guest_email || !draft.reservation_date || 
        !draft.reservation_time || !draft.party_size) {
      await sendWhatsAppText({ 
        to, 
        text: 'Datos incompletos. Escribe "hola" para comenzar de nuevo.', 
        token, 
        phoneNumberId 
      });
      await clearGuestTableDraft(pool, from);
      return;
    }
    
    // Auto-assign table
    const table = await findAvailableTable(pool, {
      hotel_id: draft.hotel_id,
      reservation_date: draft.reservation_date,
      reservation_time: draft.reservation_time,
      party_size: draft.party_size
    });
    
    if (!table) {
      // No table available
      const dateDisplay = formatDateDMY2(draft.reservation_date);
      const timeDisplay = draft.reservation_time.slice(0, 5);
      
      await sendWhatsAppText({
        to,
        text: `Lo siento, no hay mesas disponibles para ${dateDisplay} a las ${timeDisplay} para ${draft.party_size} personas.\n\n¿Quieres intentar con otra hora o menos personas?\n\nEscribe la nueva *hora* (HH:MM) o *personas* (número).`,
        token,
        phoneNumberId
      });
      
      // Go back to ask_time step to allow changing time or party size
      draft.step = 'ask_time';
      await storeGuestTableDraft(pool, from, draft);
      return;
    }
    
    // Insert reservation
    const result = await insertGuestTableReservation(pool, {
      hotel_id: draft.hotel_id,
      table_id: table.id,
      guest_name: draft.guest_name,
      guest_email: draft.guest_email,
      guest_phone: draft.guest_phone,
      reservation_date: draft.reservation_date,
      reservation_time: draft.reservation_time,
      party_size: draft.party_size,
      notes: draft.notes,
      status: 'pending',
      special_requests: null
    });
    
    logger.info('[table_guest] confirmed', { 
      res_id: result.id, 
      table_id: table.id, 
      party_size: draft.party_size 
    });
    
    // Clear draft
    await clearGuestTableDraft(pool, from);
    
    // Send success message
    await sendWhatsAppText({
      to,
      text: `¡Reserva creada! 🍽️\n\nTu código: *${result.confirmation_code}*\n\nTe confirmaremos por medio de tu correo.\n\nEscribe *hola* para volver al inicio.`,
      token,
      phoneNumberId
    });
  } catch (err) {
    logger.error('[table_guest] error', { step: 'confirm', err: err.message });
    await sendWhatsAppText({ 
      to, 
      text: 'No pudimos confirmar en este momento. Intenta de nuevo.', 
      token, 
      phoneNumberId 
    });
  }
}

/**
 * Handle edit action - restart from beginning
 */
async function handleEdit(ctx, pool, from) {
  const { to, token, phoneNumberId } = ctx;
  
  try {
    const draft = await getGuestTableDraft(pool, from);
    if (!draft || draft.kind !== 'table_guest') {
      await sendWhatsAppText({ 
        to, 
        text: 'Sesión expirada. Escribe "hola" para comenzar de nuevo.', 
        token, 
        phoneNumberId 
      });
      return;
    }
    
    // Reset to ask_name step to start over
    draft.step = 'ask_name';
    // Clear all user inputs but keep hotel_id and guest_phone
    delete draft.guest_name;
    delete draft.guest_email;
    delete draft.reservation_date;
    delete draft.reservation_time;
    delete draft.party_size;
    delete draft.notes;
    
    await storeGuestTableDraft(pool, from, draft);
    
    await sendWhatsAppText({
      to,
      text: 'Vamos a editar los datos. ¿Cuál es tu *nombre completo*?',
      token,
      phoneNumberId
    });
  } catch (err) {
    logger.error('[table_guest] error', { step: 'edit', err: err.message });
    await sendWhatsAppText({ 
      to, 
      text: 'Ocurrió un error. Intenta de nuevo.', 
      token, 
      phoneNumberId 
    });
  }
}

/**
 * Handle cancel action
 */
async function handleCancel(ctx, pool, from) {
  const { to, token, phoneNumberId } = ctx;
  
  try {
    // Clear draft
    await clearGuestTableDraft(pool, from);
    
    logger.info('[table_guest] cancel', { phone: from });
    
    await sendWhatsAppText({
      to,
      text: 'Se canceló la operación. Escribe *hola* para volver al inicio.',
      token,
      phoneNumberId
    });
  } catch (err) {
    logger.error('[table_guest] error', { step: 'cancel', err: err.message });
    await sendWhatsAppText({ 
      to, 
      text: 'Ocurrió un error al cancelar.', 
      token, 
      phoneNumberId 
    });
  }
}
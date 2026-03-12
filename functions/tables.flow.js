// tables.flow.js - Tables reservation flow
import { logger } from "./config.js";
import { sendWhatsAppText, sendMediaSequence, delay, enqueueSend, sendInteractiveButtons } from "./wa.js";
import {
  getPrimaryImageFor,
  insertTableReservation,
  getLastRoomReservationContact,
  pickAvailableTableForHotel,
  getDraft,
  upsertDraft,
  clearDraft,
  listTablesForHotel
} from "./db.js";
import { formatMoneyMXN } from "./price.js";
import { buildImageUrlFromConfig } from "./hotelconfig.js";
import { parseDateInputWithRelative, formatISOasDMY, MX_TZ, isPastDateYMD, MSG_DATE_PAST } from "./time_utils.js";

// === Table caption formatter ===
function formatTableCaption(table) {
  const name = table.name || table.table_number || 'Mesa';
  const desc = (table.description || '').trim();
  const cap = Number(table.capacity) || 1;
  const price = Number(table.price) || 0;

  return `*${name}*\n${desc}\n\n*Capacidad:* ${cap}\n*Precio:* ${formatMoneyMXN(price)}`;
}

// === List tables (info menu handler) ===
export async function handleMesas({ to, token, phoneNumberId, pool, cfg }) {
  await enqueueSend(to, async () => {
    try {
      const mesas = await listMesas(pool);
      
      // Prepare items with image paths
      for (const table of mesas) {
        table.__imagePath = await getPrimaryImageFor(pool, "tables", table.id);
      }
      
      // Send media sequence
      await sendMediaSequence({
        to,
        items: mesas,
        token,
        phoneNumberId,
        buildCaption: formatTableCaption,
        buildImageUrl: buildImageUrlFromConfig,
        perItemDelayMs: 1200
      });
      
      // Small final pause, then question + menu
      await delay(600);
      await sendWhatsAppText({ to, text: "¿Qué más desea ver?", token, phoneNumberId });
    } catch (err) {
      logger.error("Error in handleMesas:", err);
      await sendWhatsAppText({ to, text: "Ocurrió un error al obtener las mesas.", token, phoneNumberId });
    }
  });
}

async function listMesas(pool) {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name AS table_number, capacity, price, description, status
       FROM tables
       WHERE status='available'
       ORDER BY id DESC
       LIMIT 10`
    );
    return rows;
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      logger.warn({ svc: 'tables', err: 'table_not_found' });
      return [];
    }
    throw err;
  }
}

// === Utility functions ===
function safeParse(s) {
  try {
    return JSON.parse(s || '{}');
  } catch {
    return {};
  }
}

// Format YYYY-MM-DD to DD/MM/AA for display
function formatDateForDisplay(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const [yyyy, mm, dd] = yyyyMmDd.split('-');
  const aa = yyyy.slice(-2); // Last 2 digits of year
  return `${dd}/${mm}/${aa}`;
}

// === Start tables flow ===
export async function startTableFlow({ userId, phone, hotelId, pool, token, phoneNumberId }) {
  logger.info({ svc: 'table_flow', step: 'start', userId, phone, hotelId });
  
  // List tables for the hotel
  let tables = [];
  let tableId = null;
  
  try {
    tables = await listTablesForHotel(pool, hotelId);
    logger.info({ svc: 'table_flow', tablesFound: tables.length, hotelId });
    
    // Show simple text info about tables (no buttons for now, as per issue spec)
    if (tables.length > 0) {
      let tablesList = '📋 *Mesas disponibles:*\n\n';
      tables.forEach((t, idx) => {
        tablesList += `${idx + 1}. Mesa ${t.table_number} - Capacidad: ${t.capacity}`;
        if (t.location) tablesList += ` - ${t.location}`;
        tablesList += '\n';
      });
      await sendWhatsAppText({ to: phone, text: tablesList, token, phoneNumberId });
      
      // Use first available table
      tableId = tables[0]?.id || null;
    }
  } catch (err) {
    logger.error({ svc: 'table_flow', error: 'list_tables_failed', msg: err.message });
  }
  
  await upsertDraft(pool, userId, {
    svc: 'table_flow',
    step: 'date',
    waiting: 'date',
    hotelId: hotelId,
    draft: JSON.stringify({ hotelId, tableId })
  });
  
  await sendWhatsAppText({ 
    to: phone, 
    text: 'Indica la *fecha* (formato *DD/MM/AA*).\nTambién puedes escribir *hoy* o *mañana*.\nEj: 09/12/26', 
    token, 
    phoneNumberId
  });
}

// This is the wrapper called from router.js
// Note: hotelId is hardcoded to 6 as per issue spec requirement "hotel fijo = 6"
export async function startTablesFlow({ to, pool, user, token, phoneNumberId }) {
  await startTableFlow({ userId: user.id, phone: to, hotelId: 6, pool, token, phoneNumberId });
}

// === Handle table text input ===
export async function handleTableText({ to, text, pool, user, token, phoneNumberId }) {
  const draft = await getDraft(pool, user.id);
  if (!draft || draft.svc !== 'table_flow') return false;

  logger.info({ svc: 'table_flow', step: draft.step, waiting: draft.waiting, userId: user.id, text });

  const data = safeParse(draft.draft) || {};

  // Step 1: Date input (DD/MM/AA format or hoy/mañana)
  if (draft.waiting === 'date') {
    const iso = parseDateInputWithRelative(text, MX_TZ);
    if (!iso) {
      await sendWhatsAppText({ 
        to, 
        text: 'Formato inválido. Usa *DD/MM/AA*, o escribe *hoy* / *mañana*.\nEj: 20/10/25', 
        token, 
        phoneNumberId 
      });
      return true;
    }
    
    // Validate date is not in the past
    if (isPastDateYMD(iso, MX_TZ)) {
      await sendWhatsAppText({ to, text: MSG_DATE_PAST(), token, phoneNumberId });
      await sendWhatsAppText({ 
        to, 
        text: 'Indica la *fecha* (formato *DD/MM/AA*).\nTambién puedes escribir *hoy* o *mañana*.\nEj: 09/12/26', 
        token, 
        phoneNumberId
      });
      return true;
    }
    
    data.date = iso;
    
    await upsertDraft(pool, user.id, { 
      step: 'time', 
      waiting: 'time', 
      draft: JSON.stringify(data) 
    });
    
    logger.info({ svc: 'table_flow', step: 'date', date: data.date, userId: user.id });
    
    await sendWhatsAppText({ 
      to, 
      text: `Fecha: *${formatISOasDMY(iso)}*. Ahora la *hora* (formato *HH:MM*). Ej: 13:00`, 
      token, 
      phoneNumberId 
    });
    return true;
  }

  // Step 2: Time input (HH:MM format with regex validation)
  if (draft.waiting === 'time') {
    // Regex: ^([01]\d|2[0-3]):([0-5]\d)$
    const m = text.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!m) {
      await sendWhatsAppText({ to, text: 'Hora inválida. Usa *HH:MM*. Ej: 13:00', token, phoneNumberId });
      return true;
    }
    
    data.time = `${text}:00`; // Store as HH:MM:SS
    
    await upsertDraft(pool, user.id, { 
      step: 'party', 
      waiting: 'party', 
      draft: JSON.stringify(data) 
    });
    
    logger.info({ svc: 'table_flow', step: 'time', time: data.time, userId: user.id });
    
    await sendWhatsAppText({ to, text: '¿Para cuantas personas la mesa? (Tenga en cuanta la capacidad de la mesa)', token, phoneNumberId });
    return true;
  }

  // Step 3: Party size input (integer validation)
  if (draft.waiting === 'party') {
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n > 20) {
      await sendWhatsAppText({ to, text: 'Cantidad inválida. Debe ser un número de acuerdo a la capacidad.', token, phoneNumberId });
      return true;
    }
    
    data.party = n;

    // Prefills de contacto desde última reserva de habitación
    const contact = await getLastRoomReservationContact(pool, to);
    data.guest_email = contact.guest_email ?? null;
    data.guest_phone = contact.guest_phone ?? to;

    await upsertDraft(pool, user.id, {
      step: 'confirm',
      waiting: 'confirm',
      draft: JSON.stringify(data)
    });
    
    logger.info({ svc: 'table_flow', step: 'party', party: n, contact, userId: user.id });

    // Show confirmation card
    const dateDisplay = formatDateForDisplay(data.date);
    const timeDisplay = data.time.slice(0, 5);
    
    const confirmText = 
      `*Confirmar reserva de mesa*\n\n` +
      `Fecha: ${dateDisplay}\n` +
      `Hora: ${timeDisplay}\n` +
      `Personas: ${data.party}\n`;
    
    await sendWhatsAppText({ to, text: confirmText, token, phoneNumberId });
    
    await sendInteractiveButtons({
      to,
      body: '¿Confirmas tu reserva?',
      buttons: [
        { id: 'table_confirm_yes', title: 'Confirmar' },
        { id: 'table_confirm_no', title: 'Cancelar' }
      ],
      token,
      phoneNumberId
    });
    
    return true;
  }

  return false;
}

// === Handle table button actions ===
export async function handleTableButtons({ to, id, pool, user, token, phoneNumberId }) {
  const draft = await getDraft(pool, user.id);
  if (!draft || draft.svc !== 'table_flow') return false;

  logger.info({ svc: 'table_flow', action: 'button', id, userId: user.id });

  const data = safeParse(draft.draft) || {};

  // Cancel button
  if (id === 'table_confirm_no') {
    await clearDraft(pool, user.id);
    await sendWhatsAppText({ 
      to, 
      text: 'Reserva cancelada. Escribe *hola* para comenzar.', 
      token, 
      phoneNumberId 
    });
    logger.info({ svc: 'table_flow', step: 'cancel', userId: user.id });
    return true;
  }

  // Confirm button
  if (id === 'table_confirm_yes') {
    logger.info({ svc: 'table_flow', step: 'confirm', data, userId: user.id });
    
    // Validación: asegurar que table_id no sea nulo
    if (!data.tableId) {
      await sendWhatsAppText({ 
        to, 
        text: 'No pude identificar la mesa. Intenta de nuevo con *Reservar mesas*.', 
        token, 
        phoneNumberId 
      });
      await clearDraft(pool, user.id);
      return true;
    }
    
    // Inserción final
    const payload = {
      hotel_id: data.hotelId || 6,
      table_id: data.tableId,
      guest_id: user.id,
      guest_name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.first_name || null,
      guest_email: data.guest_email ?? null,
      guest_phone: data.guest_phone ?? null,
      reservation_date: data.date,       // YYYY-MM-DD
      reservation_time: data.time,       // HH:MM:SS
      party_size: data.party,
      notes: null
    };
    
    try {
      await insertTableReservation(pool, payload);
      await clearDraft(pool, user.id);
      
      logger.info({ svc: 'table_flow', step: 'confirmed', payload, userId: user.id });
      
      await sendWhatsAppText({ 
        to, 
        text: '✅ ¡Reserva de mesa registrada!, si necesitas más no dudes en enviarnos un *hola* Te esperamos.', 
        token, 
        phoneNumberId 
      });
    } catch (err) {
      logger.error({ svc: 'table_flow', error: 'insert_failed', msg: err.message, userId: user.id });
      await sendWhatsAppText({ 
        to, 
        text: 'Ocurrió un error al registrar la reserva. Intenta de nuevo.', 
        token, 
        phoneNumberId 
      });
    }
    
    return true;
  }

  return false;
}
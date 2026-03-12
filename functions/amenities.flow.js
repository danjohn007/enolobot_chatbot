// amenities.flow.js - Amenity reservation flow
import { logger, AMENITY_FLOW_STATES } from "./config.js";
import { 
  listAvailableAmenitiesForHotel,
  createAmenityDraft,
  amenitySetEmail,
  amenitySetScheduleAndParty,
  amenityUpdateNotes,
  amenityConfirm,
  amenityCancel,
  amenityGetLastDraft,
  getPrimaryImageFor,
  getAmenityById,
  listAmenityImages,
  countAmenityImages
} from "./db.js";
import { 
  sendWhatsAppText, 
  sendImageWithCaption,
  sendInteractiveButtons,
  delay,
  sendMediaSequence,
  enqueueSend
} from "./wa.js";
import { 
  parseDMY2ToISO,
  parseHHMM,
  withinTime,
  isValidEmail,
  normalizeUserText,
  formatMoneyMXN,
  formatDateDMY2,
  digitsChatId
} from "./price.js";
import { normalizeHHMM, isTimeInRange, parseDateInputWithRelative, formatISOasDMY, MX_TZ, isPastDateYMD, MSG_DATE_PAST } from "./time_utils.js";
import { getHotelIdForReservations, buildImageUrlFromConfig } from "./hotelconfig.js";
import { clearState } from "./rooms.flow.js";

const AMENITY_DISPLAY_DELAY = 1500;
const PAGE_SIZE = 6; // Number of amenities to show per page
const AMENITY_IMG_PAGE = 4; // nº de imágenes por "Ver más"

// === Helpers ===
function normalizeAmenityNotes(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

// === Time formatter ===
function hhmm(t) {
  // t viene tipo '08:00:00' -> '08:00'
  if (!t) return '';
  const m = /^(\d{2}:\d{2})/.exec(String(t));
  return m ? m[1] : String(t);
}

// === Caption formatter ===
function formatAmenityCaption(amenity) {
  const lines = [];
  lines.push(`*${amenity.name}*`);
  lines.push("");
  const open = hhmm(amenity.opening_time);
  const close = hhmm(amenity.closing_time);
  if (open && close) lines.push(`*Horario:* ${open}–${close}`);
  if (amenity.capacity) lines.push(`*Capacidad:* ${amenity.capacity}`);
  if (amenity.price != null) lines.push(`*Precio:* ${formatMoneyMXN(amenity.price)}`);
  if (amenity.description) lines.push(`${amenity.description}`);
  return lines.join("\n");
}

// === Send individual amenity card with image and buttons ===
async function sendAmenityCard({ to, token, phoneNumberId, pool }, amenity) {
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
    logger.error({ svc: 'amenity', err: 'missing_amenity_id_on_button', raw: amenity });
    return;
  }
  
  const btnId = `amen_pick_${amenityId}`;
  logger.info({ svc: 'amenity', debug: 'send_button', btnId, amenityId, name: amenity.name });

  // Check if there are more images to show
  const totalImgs = await countAmenityImages(pool, amenityId);
  const buttons = [{ id: btnId, title: 'Elegir esta' }];
  
  // Add "Ver más" button only if there are more than 1 image
  if (totalImgs > 1) {
    buttons.push({ id: `amenities:imgs:${amenityId}:1`, title: 'Ver más' });
  }

  await sendInteractiveButtons({
    to,
    body: `¿Quieres seleccionar *${amenity.name}*?`,
    buttons,
    token,
    phoneNumberId
  });

  await delay(AMENITY_DISPLAY_DELAY);
}

// === Send amenities page by page ===
export async function sendAmenityPage({ to, token, phoneNumberId, pool, user }, page = 0) {
  const hotelId = getHotelIdForReservations(user);
  const offset = page * PAGE_SIZE;
  const items = await listAvailableAmenitiesForHotel(pool, hotelId, { limit: PAGE_SIZE, offset });
  
  logger.info('[amenities] fetched', { count: items.length, page, hotelId });
  
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

  // Send each amenity with image principal
  for (const a of items) {
    await sendAmenityCard({ to, token, phoneNumberId, pool }, a);
  }

  // Check if there are more amenities
  const maybeMore = await listAvailableAmenitiesForHotel(pool, hotelId, { limit: 1, offset: offset + PAGE_SIZE });
  const hasMore = maybeMore.length > 0;
  
  logger.info({ svc: 'amenity', action: 'checkMore', page, hasMore });
  
  if (hasMore) {
    // Send "Ver más" button
    const msg = '¿Quieres ver más amenidades?';
    const buttons = [{ id: `amenities:more:${page + 1}`, title: 'Ver más' }];
    await sendInteractiveButtons({ to, body: msg, buttons, token, phoneNumberId });
  }
}

// === Send amenity images page by page ===
async function sendAmenityImagesPage({ to, token, phoneNumberId, pool }, amenityId, page) {
  // offset: ya se envió la primaria, así que arrancamos en 1
  const offset = 1 + (page - 1) * AMENITY_IMG_PAGE;
  const imgs = await listAmenityImages(pool, amenityId, { limit: AMENITY_IMG_PAGE, offset });
  
  if (!imgs.length) {
    return sendWhatsAppText({ to, text: 'No hay más imágenes de esta amenidad.', token, phoneNumberId });
  }

  for (const it of imgs) {
    const url = buildImageUrlFromConfig(it.image_path);
    // Puedes mandar con o sin caption; aquí sin para agilizar
    if (url) {
      try {
        await sendImageWithCaption({ to, imageUrl: url, caption: '', token, phoneNumberId });
      } catch (err) {
        logger.error({ svc: 'amenity', err: 'send_image_failed', image: it.image_path, error: err.message });
      }
    }
  }

  // ¿hay más?
  const total = await countAmenityImages(pool, amenityId);
  const shown = offset + imgs.length;
  
  if (shown < total) {
    await sendInteractiveButtons({
      to,
      body: '¿Ver más imágenes?',
      buttons: [{ id: `amenities:imgs:${amenityId}:${page + 1}`, title: 'Ver más' }],
      token,
      phoneNumberId
    });
  } else {
    // opcional: botón volver
    await sendInteractiveButtons({
      to,
      body: 'Eso es todo 🙂',
      buttons: [{ id: `amen_pick_${amenityId}`, title: 'Reservar' }],
      token,
      phoneNumberId
    });
  }
}

// === Handle amenities postback (including "Ver más") ===
export async function handleAmenitiesPostback({ to, token, phoneNumberId, pool, user }, payload) {
  // Handle "Ver más" images payload: amenities:imgs:<amenityId>:<page>
  const imgMatch = /^amenities:imgs:(\d+):(\d+)$/.exec(payload);
  if (imgMatch) {
    const amenityId = parseInt(imgMatch[1], 10);
    const page = parseInt(imgMatch[2], 10); // 1,2,3...
    logger.info({ svc: 'amenity', action: 'handleImgsMore', amenityId, page });
    return sendAmenityImagesPage({ to, token, phoneNumberId, pool }, amenityId, page);
  }
  
  // payload: amenities:more:<n>
  const m = /^amenities:more:(\d+)$/.exec(payload);
  if (m) {
    const nextPage = parseInt(m[1], 10) || 0;
    logger.info({ svc: 'amenity', action: 'handleMore', nextPage });
    return sendAmenityPage({ to, token, phoneNumberId, pool, user }, nextPage);
  }
  
  // Other payloads can be handled here in the future
  return false;
}

// === Prompts ===
async function promptAmenityDate({ to, token, phoneNumberId }) {
  await sendWhatsAppText({
    to,
    text: "Indica la *fecha* de tu visita (formato *DD/MM/AA*).\nTambién puedes escribir *hoy* o *mañana*.\nEjemplo: *09/12/26*",
    token, phoneNumberId
  });
}

async function promptAmenityTime({ to, token, phoneNumberId, open, close }) {
  await sendWhatsAppText({
    to,
    text: `Ahora la *hora* (formato *HH:MM*). El horario válido es de *${open} a ${close}*.\nEjemplo: *12:00*`,
    token, phoneNumberId
  });
}

async function promptAmenityParty({ to, token, phoneNumberId, capacity }) {
  const cap = Number(capacity) || 0;
  const hint = cap > 1 ? `(mínimo 1, capacidad máxima ${cap})` : '';
  await sendWhatsAppText({
    to,
    text: `Por último, ¿Para cuántas personas? ${hint}`,
    token, phoneNumberId
  });
}

// === Info menu handler (for "amenities" button) ===
export async function handleAmenidades({ to, token, phoneNumberId, pool, cfg }) {
  await enqueueSend(to, async () => {
    try {
      const { hotel } = await import('./hotelconfig.js');
      const hotelId = hotel.hotelId;
      
      // Send all amenities in pages (without limit)
      const amenidades = await listAvailableAmenitiesForHotel(pool, hotelId, { limit: null, offset: 0 });
      
      // Prepare items with image paths from query result
      for (const amenity of amenidades) {
        amenity.__imagePath = amenity.primary_image_path || null;
      }
      
      // Send media sequence
      await sendMediaSequence({
        to,
        items: amenidades,
        token,
        phoneNumberId,
        buildCaption: formatAmenityCaption,
        buildImageUrl: buildImageUrlFromConfig,
        perItemDelayMs: 1200
      });
      
      // Small final pause, then question + menu
      await delay(600);
      await sendWhatsAppText({ to, text: "¿Qué más desea ver?", token, phoneNumberId });
    } catch (err) {
      logger.error("Error in handleAmenidades:", { 
        message: err.message, 
        code: err.code, 
        sqlMessage: err.sqlMessage 
      });
      await sendWhatsAppText({ to, text: "Ocurrió un error al obtener las amenidades.", token, phoneNumberId });
    }
  });
}

// === Start amenity flow ===
export async function startAmenityFlow({ to, token, phoneNumberId, pool, user }) {
  try {
    logger.info({ svc: 'amenity', step: 'start', userId: user?.id });
    return sendAmenityPage({ to, token, phoneNumberId, pool, user }, 0);
  } catch (err) {
    logger.error('startAmenityFlow failed', { 
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

// === Handle amenity button actions ===
export async function handleAmenityButtons({ to, id, pool, user, token, phoneNumberId }) {
  // Handle "Ver más" button
  if (id.startsWith("amenities:")) {
    if (!user) {
      await sendWhatsAppText({ to, text: "Sesión expirada.", token, phoneNumberId });
      return;
    }
    return handleAmenitiesPostback({ to, token, phoneNumberId, pool, user }, id);
  }

  if (id.startsWith("amen_pick_")) {
    if (!user) {
      await sendWhatsAppText({ to, text: "Sesión expirada.", token, phoneNumberId });
      return;
    }
    const amenityId = Number(id.replace('amen_pick_', ''));
    if (!Number.isFinite(amenityId)) {
      logger.error({ svc: 'amenity', err: 'invalid_amenity_id_from_button', rawId: id });
      await sendWhatsAppText({ to, text: 'Ocurrió un problema al seleccionar la amenidad.', token, phoneNumberId });
      return;
    }
    await handleAmenityPick({ to, token, phoneNumberId, pool, amenityId, user });
    return;
  }

  if (id.startsWith("amen_email_old_")) {
    if (!user) {
      await sendWhatsAppText({ to, text: "Sesión expirada.", token, phoneNumberId });
      return;
    }
    const draftId = Number(id.split('_').pop());
    await handleAmenityEmailOld({ to, token, phoneNumberId, pool, user, draftId });
    return;
  }

  if (id.startsWith("amen_email_new_")) {
    if (!user) {
      await sendWhatsAppText({ to, text: "Sesión expirada.", token, phoneNumberId });
      return;
    }
    const draftId = Number(id.split('_').pop());
    await handleAmenityEmailNew({ to, token, phoneNumberId, pool, draftId, user });
    return;
  }

  if (id.startsWith("amen_confirm_")) {
    if (!user) {
      await sendWhatsAppText({ to, text: "Sesión expirada.", token, phoneNumberId });
      return;
    }
    const draftId = Number(id.split('_').pop());
    await handleAmenityConfirm({ to, token, phoneNumberId, pool, user, draftId });
    return;
  }

  if (id.startsWith("amen_cancel_")) {
    if (!user) {
      await sendWhatsAppText({ to, text: "Sesión expirada.", token, phoneNumberId });
      return;
    }
    const draftId = Number(id.split('_').pop());
    await handleAmenityCancel({ to, token, phoneNumberId, pool, user, draftId });
    return;
  }
}

// === Pick amenity ===
async function handleAmenityPick({ to, token, phoneNumberId, pool, amenityId, user }) {
  try {
    // Validate amenityId
    if (!Number.isFinite(amenityId)) {
      logger.error({ svc: 'amenity', err: 'invalid_amenityId', id: amenityId });
      await sendWhatsAppText({ to, text: 'Amenidad inválida.', token, phoneNumberId });
      return;
    }

    // Get amenity using safe column handling
    const amenity = await getAmenityById(pool, amenityId);
    if (!amenity) {
      logger.error({ svc: 'amenity', err: 'amenity_not_found', amenityId });
      await sendWhatsAppText({ to, text: 'No encontré la amenidad seleccionada.', token, phoneNumberId });
      return;
    }

    // Clear any existing room reservation state to avoid conflicts
    const chatId = digitsChatId(to);
    clearState(chatId);

    const hotelId = getHotelIdForReservations(user);
    const draft = await createAmenityDraft(pool, { hotelId, user, amenity });

    logger.info({ svc: 'amenity', step: 'draft_created', draftId: draft.id, amenityId, userId: user?.id });

    // Siguiente paso según si el usuario tiene email
    if (user?.email) {
      await sendWhatsAppText({
        to,
        text: 'Indica la *fecha* de tu visita (formato *DD/MM/AA*).\nTambién puedes escribir *hoy* o *mañana*.\nEjemplo: *09/12/26*',
        token,
        phoneNumberId
      });
    } else {
      await sendWhatsAppText({
        to,
        text: 'Escribe tu nuevo correo (usuario@dominio).',
        token,
        phoneNumberId
      });
    }
  } catch (err) {
    logger.error('handleAmenityPick failed', { 
      amenityId, 
      userId: user?.id, 
      err: err.message,
      code: err.code,
      sqlMessage: err.sqlMessage
    });
    await sendWhatsAppText({ to, text: 'Ocurrió un error al seleccionar la amenidad.', token, phoneNumberId });
  }
}

async function handleAmenityEmailOld({ to, token, phoneNumberId, pool, user, draftId }) {
  try {
    await amenitySetEmail(pool, draftId, user.email);
    await amenityUpdateNotes(pool, draftId, { step: 'date', waiting: 'date' });
    
    const after = await amenityGetLastDraft(pool, user.id);
    const notesAfter = normalizeAmenityNotes(after?.notes);
    logger.info({ 
      svc: 'amenity', 
      step: 'date_fixed', 
      draftId, 
      userId: user.id, 
      usedOld: true, 
      waiting: notesAfter.waiting, 
      stepNow: notesAfter.step 
    });
    
    await promptAmenityDate({ to, token, phoneNumberId });
  } catch (err) {
    logger.error('handleAmenityEmailOld failed', { err, draftId, userId: user.id });
    await sendWhatsAppText({ to, text: "Ocurrió un error.", token, phoneNumberId });
  }
}

async function handleAmenityEmailNew({ to, token, phoneNumberId, pool, draftId, user }) {
  try {
    await amenityUpdateNotes(pool, draftId, { step: 'enter_email', waiting: 'email' });
    logger.info({ svc: 'amenity', step: 'set_waiting', draftId, userId: user.id, waiting: 'email' });
    await sendWhatsAppText({ to, text: 'Escribe tu nuevo correo (usuario@dominio).', token, phoneNumberId });
  } catch (err) {
    logger.error('handleAmenityEmailNew failed', { err, draftId, userId: user?.id });
    await sendWhatsAppText({ to, text: "Ocurrió un error.", token, phoneNumberId });
  }
}

async function handleAmenityConfirm({ to, token, phoneNumberId, pool, user, draftId }) {
  try {
    await amenityConfirm(pool, draftId);
    
    logger.info({ svc: 'amenity', step: 'confirm', draftId, userId: user.id, status: 'confirmed' });
    
    await sendWhatsAppText({ to, text: '✅ Reserva de amenidad registrada. ¡Gracias!', token, phoneNumberId });
  } catch (err) {
    logger.error('handleAmenityConfirm failed', { err, draftId, userId: user.id });
    await sendWhatsAppText({ to, text: "Ocurrió un error al confirmar.", token, phoneNumberId });
  }
}

async function handleAmenityCancel({ to, token, phoneNumberId, pool, user, draftId }) {
  try {
    await amenityCancel(pool, draftId);
    logger.info({ svc: 'amenity', step: 'cancel', draftId, userId: user.id, status: 'cancelled' });
    await sendWhatsAppText({ to, text: 'Se canceló la operación, escribe "hola" para volver al inicio.', token, phoneNumberId });
  } catch (err) {
    logger.error('handleAmenityCancel failed', { err, draftId, userId: user.id });
    await sendWhatsAppText({ to, text: "Ocurrió un error al cancelar.", token, phoneNumberId });
  }
}

// === Handle amenity text input ===
export async function handleAmenityText({ to, text, pool, user, token, phoneNumberId }) {
  if (!user) return false;
  
  const draft = await amenityGetLastDraft(pool, user.id);
  if (!draft) return false;

  const notes = normalizeAmenityNotes(draft.notes);
  let w = notes.waiting;
  let s = notes.step;
  
  // Safety fix: if there's a valid waiting and step doesn't match, force consistency
  if (w && typeof w === 'string') {
    if (AMENITY_FLOW_STATES.has(w) && s !== w) {
      await amenityUpdateNotes(pool, draft.id, { step: w });
      s = w;
      logger.warn({ 
        svc: 'amenity', 
        fix: 'step_sync_to_waiting', 
        draftId: draft.id, 
        waiting: w, 
        stepFixed: s 
      });
    }
  }
  
  const txtNorm = normalizeUserText(text);
  logger.info({ svc: 'amenity', debug: 'text_in', draftId: draft.id, waiting: w, step: s, text: txtNorm });
  
  // Handle email input
  if (notes?.waiting === 'email' || notes?.step === 'enter_email') {
    const email = normalizeUserText(text);
    if (!isValidEmail(email)) {
      await sendWhatsAppText({ 
        to, 
        text: 'Correo inválido, intenta de nuevo (usuario@dominio).', 
        token, 
        phoneNumberId 
      });
      return true;
    }
    await amenitySetEmail(pool, draft.id, email);
    await amenityUpdateNotes(pool, draft.id, { step: 'date', waiting: 'date' });
    
    logger.info({ svc: 'amenity', step: 'email', draftId: draft.id, userId: user.id, usedOld: false, waiting: 'date' });
    
    await promptAmenityDate({ to, token, phoneNumberId });
    return true;
  }
  
  // Handle date input
  if (notes?.waiting === 'date' || notes?.step === 'date') {
    const iso = parseDateInputWithRelative(text, MX_TZ);
    if (!iso) {
      await sendWhatsAppText({ 
        to, 
        text: "Formato inválido. Usa *DD/MM/AA*, o escribe *hoy* / *mañana*.\nEjemplo: *09/12/26*", 
        token, 
        phoneNumberId 
      });
      return true;
    }
    
    // Validate date is not in the past
    if (isPastDateYMD(iso, MX_TZ)) {
      await sendWhatsAppText({ to, text: MSG_DATE_PAST(), token, phoneNumberId });
      await promptAmenityDate({ to, token, phoneNumberId });
      return true;
    }
    
    await amenityUpdateNotes(pool, draft.id, { step: 'time', waiting: 'time', dateISO: iso });
    logger.info({ svc: 'amenity', step: 'date', draftId: draft.id, userId: user.id, dateISO: iso, waiting: 'time' });
    await sendWhatsAppText({
      to,
      text: `Fecha: *${formatISOasDMY(iso)}*. ¿A qué *hora*? (formato *HH:MM*).\nEl horario válido es de *${notes.opening_time?.slice(0,5) || '00:00'} a ${notes.closing_time?.slice(0,5) || '00:00'}*.\nEjemplo: *12:00*`,
      token,
      phoneNumberId
    });
    return true;
  }

  // Handle time input
  if (notes?.waiting === 'time' || notes?.step === 'time') {
    const hhmm = normalizeHHMM(text);
    if (!hhmm) {
      await sendWhatsAppText({
        to, 
        text: `Formato inválido. Usa *HH:MM* (24h). Ejemplo: *12:00*`,
        token, 
        phoneNumberId
      });
      return true;
    }
    
    const open = (notes.opening_time || '00:00:00').slice(0, 5);   // "HH:MM"
    const close = (notes.closing_time || '00:00:00').slice(0, 5);
    
    // Validate time is within range (supports windows crossing midnight)
    if (!isTimeInRange(hhmm, open, close)) {
      const closeDisplay = close === '00:00' ? '00:00' : close;
      await sendWhatsAppText({
        to, 
        text: `Fuera de horario. Válido: *${open}–${closeDisplay}*.\nEjemplo: *12:00*`,
        token, 
        phoneNumberId
      });
      logger.info({ 
        svc: 'amenity', 
        step: 'time_check', 
        t: hhmm, 
        open, 
        close, 
        ok: false, 
        draftId: draft.id 
      });
      return true; // KEEP WAITING FOR VALID TIME
    }
    
    // Accept and move to party step
    await amenityUpdateNotes(pool, draft.id, { step: 'party', waiting: 'party', timeHHMM: hhmm });
    logger.info({ svc: 'amenity', step: 'time', draftId: draft.id, userId: user.id, timeHHMM: hhmm, waiting: 'party' });
    await promptAmenityParty({ to, token, phoneNumberId, capacity: notes.capacity || 1 });
    return true;
  }

  // Handle party size input
  if (notes?.waiting === 'party' || notes?.step === 'party') {
    // Extract first sequence of digits from input (handles "1-1", "1", "10", etc.)
    const digits = String(text || '').match(/\d+/);
    const n = digits ? Number(digits[0]) : NaN;
    
    // Validate: must be integer >= 1 (no maximum limit as per requirements)
    if (!Number.isInteger(n) || n < 1) {
      await sendWhatsAppText({
        to, text: `Cantidad inválida. Debe ser un número entero *mayor o igual a 1*.`,
        token, phoneNumberId
      });
      logger.info({ 
        svc: 'amenity', 
        step: 'party_check', 
        text,
        n, 
        ok: false, 
        draftId: draft.id 
      });
      return true; // KEEP WAITING FOR VALID PARTY SIZE
    }

    await amenitySetScheduleAndParty(pool, draft.id, {
      ymd: notes.dateISO,
      timeHHmm: notes.timeHHMM,
      partySize: n
    });

    await amenityUpdateNotes(pool, draft.id, {
      step: 'confirm', waiting: null, party: n
    });

    logger.info({ svc: 'amenity', step: 'schedule', draftId: draft.id, userId: user.id, ymd: notes.dateISO, hhmm: notes.timeHHMM, party: n });

    const totalLine = notes.price ? `*Total:* ${formatMoneyMXN(Number(notes.price) * n)}` : '';
    const resumen =
      `*Muy bien ${user.first_name}, estos son tus datos de reserva:*\n\n` +
      `*Amenidad:* ${notes.amenityName}\n` +
      `*Fecha:* ${formatDateDMY2(notes.dateISO)}   *Hora:* ${notes.timeHHMM}\n` +
      `*Personas:* ${n}\n` +
      (notes.price ? `*Precio por persona:* ${formatMoneyMXN(notes.price)}  ${totalLine}` : '');

    await sendWhatsAppText({ to, text: resumen, token, phoneNumberId });
    await sendInteractiveButtons({
      to,
      body: "¿Confirmas tu reserva?",
      buttons: [
        { id: `amen_confirm_${draft.id}`, title: 'Confirmar' },
        { id: `amen_cancel_${draft.id}`,  title: 'Cancelar'  }
      ],
      token, phoneNumberId
    });
    return true;
  }

  return false;
}
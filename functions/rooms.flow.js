// rooms.flow.js - Room listing and reservation flow
import { logger } from "./config.js";
import { 
  listAvailableRoomsForHotel,
  listRoomsForHotel,
  getRoomImages, 
  amenityGetLastDraft,
  amenityCancel,
  getPrimaryImageFor
} from "./db.js";
import { 
  sendWhatsAppText, 
  sendWhatsAppImage, 
  sendInteractiveButtons,
  sendMediaSequence,
  delay,
  enqueueSend
} from "./wa.js";
import { buildPublicUrl } from "./media.js";
import { getPriceForDate, formatMXN, todayISO, digitsChatId, formatMoneyMXN } from "./price.js";
import { hotel, getHotelIdForReservations, buildImageUrlFromConfig } from "./hotelconfig.js";

// === State management ===
const stateStore = new Map();
const WIZARD_TTL_MS = 30 * 60 * 1000;

export function getState(chatId) {
  const s = stateStore.get(chatId);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    stateStore.delete(chatId);
    return null;
  }
  return s.data;
}

export function setState(chatId, data) {
  stateStore.set(chatId, { data, expiresAt: Date.now() + WIZARD_TTL_MS });
}

export function clearState(chatId) {
  stateStore.delete(chatId);
}

function minutesAgo(dateStr) {
  return (Date.now() - new Date(dateStr).getTime()) / 60000;
}

// === Room caption formatter ===
function formatRoomCaption(room) {
  const name = room.room_number || room.name || 'Habitación';
  const desc = (room.description || '').trim();
  const type = room.type || 'N/A';
  const cap = Number(room.capacity) || 1;
  const price = Number(room.price) || 0;

  return `*${name}*\n${desc}\n\n*Tipo:* ${type}\n*Capacidad:* ${cap}\n*Precio:* ${formatMXN(price)}`;
}

// === Pagination for room listing ===
const ROOMS_PAGE_SIZE = 6;

/**
 * Build room caption with all relevant fields
 */
function buildRoomCaption(r) {
  const base = `*Hab. ${r.room_number}* (${r.type})`;
  const cap = r.capacity ? `\nCapacidad: ${r.capacity}` : '';
  const piso = (r.floor != null) ? `\nPiso: ${r.floor}` : '';
  const price = (r.price != null) ? `\nPrecio base: ${formatMoneyMXN(r.price)}` : '';
  const desc = r.description ? `\n${r.description}` : '';
  return `${base}${cap}${piso}${price}${desc}`;
}

/**
 * Send a single room card with image and buttons
 */
async function sendRoomCard({ to, room, token, phoneNumberId, pool, cfg }) {
  const img = await getPrimaryImageFor(pool, 'room', room.id);
  const url = img ? buildImageUrlFromConfig(img) : null;
  const caption = buildRoomCaption(room);
  
  if (url) {
    await sendWhatsAppImage({ to, imageUrl: url, caption, token, phoneNumberId });
  } else {
    await sendWhatsAppText({ to, text: caption, token, phoneNumberId });
  }
  
  // Send action buttons
  await sendInteractiveButtons({
    to,
    body: `¿Quieres seleccionar *${room.room_number}*?`,
    buttons: [
      { id: `reserve_pick_room_${room.id}`, title: 'Elegir ésta' },
      { id: `room_more_${room.id}_page_1`, title: 'Ver más' }
    ],
    token,
    phoneNumberId,
  });
  
  // Small delay for message ordering
  await delay(900);
}

/**
 * Send a page of rooms with pagination support
 */
export async function sendRoomsPage({ to, token, phoneNumberId, pool, cfg, hotelId }, page = 0) {
  const offset = page * ROOMS_PAGE_SIZE;
  const items = await listRoomsForHotel(pool, hotelId, { limit: ROOMS_PAGE_SIZE, offset /*, includeAll:true */ });
  
  logger.info({ svc: 'rooms', action: 'sendRoomsPage', page, hotelId, count: items.length });
  
  if (!items.length) {
    if (page === 0) {
      await sendWhatsAppText({ to, text: 'No hay habitaciones disponibles por el momento.', token, phoneNumberId });
      return;
    }
    await sendWhatsAppText({ to, text: 'No hay más habitaciones.', token, phoneNumberId });
    return;
  }
  
  // Send each room card
  for (const r of items) {
    await sendRoomCard({ to, room: r, token, phoneNumberId, pool, cfg });
  }
  
  // Check if there are more rooms
  const hasMore = (await listRoomsForHotel(
    pool, hotelId, { limit: 1, offset: offset + ROOMS_PAGE_SIZE /*, includeAll:true */ }
  )).length > 0;
  
  if (hasMore) {
    await sendInteractiveButtons({
      to,
      body: '¿Quieres ver más habitaciones?',
      buttons: [{ id: `rooms:more:${page + 1}`, title: 'Ver más' }],
      token,
      phoneNumberId
    });
  }
}

/**
 * Handle rooms postback actions (pagination and other room-related actions)
 */
export async function handleRoomsPostback({ to, token, phoneNumberId, pool, cfg, hotelId }, payload) {
  const m = /^rooms:more:(\d+)$/.exec(payload);
  if (m) {
    const nextPage = parseInt(m[1], 10) || 0;
    logger.info({ svc: 'rooms', action: 'handleRoomsPostback', payload, nextPage });
    return sendRoomsPage({ to, token, phoneNumberId, pool, cfg, hotelId }, nextPage);
  }
  // Other payloads can be handled here if needed
  return false;
}

// === Send minimal room card ===
async function sendRoomCardMinimal({ to, room, dateISO, token, phoneNumberId, baseMediaUrl, pool }) {
  const price = getPriceForDate(room, dateISO || todayISO());
  const desc = (room.description || '').trim();
  const cap = Number(room.capacity) || 1;
  const text = 
`*${room.room_number || room.name || 'Habitación'}*
${desc}

*Capacidad:* ${cap}
*Precio:* ${formatMXN(price)}`;

  // Get and send main image using primary_image_path from room object
  const mainImage = buildPublicUrl(baseMediaUrl, room.primary_image_path);
  if (mainImage) {
    await sendWhatsAppImage({ to, imageUrl: mainImage, caption: text, token, phoneNumberId });
  } else {
    await sendWhatsAppText({ to, text, token, phoneNumberId });
  }

  // Send action buttons
  await sendInteractiveButtons({
    to,
    body: `¿Quieres seleccionar *${room.room_number || room.name}*?`,
    buttons: [
      { id: `reserve_pick_room_${room.id}`, title: 'Elegir ésta' },
      { id: `room_more_${room.id}_page_1`, title: 'Ver más' }
    ],
    token,
    phoneNumberId,
  });
  
  // Small delay for message ordering
  await delay(900);
}

// === Info menu handler (for "rooms" button) ===
export async function handleHabitaciones({ to, token, phoneNumberId, pool, cfg }) {
  await enqueueSend(to, async () => {
    try {
      const hotelId = hotel.hotelId;
      const habitaciones = await listAvailableRoomsForHotel(pool, hotelId, 10);
      
      // Prepare items with image paths
      for (const room of habitaciones) {
        room.__imagePath = await getPrimaryImageFor(pool, "rooms", room.id);
      }
      
      // Send media sequence
      await sendMediaSequence({
        to,
        items: habitaciones,
        token,
        phoneNumberId,
        buildCaption: formatRoomCaption,
        buildImageUrl: buildImageUrlFromConfig,
        perItemDelayMs: 1200
      });
      
      // Small final pause, then question + menu
      await delay(600);
      await sendWhatsAppText({ to, text: "¿Qué más desea ver?", token, phoneNumberId });
    } catch (err) {
      logger.error("Error in handleHabitaciones:", err);
      await sendWhatsAppText({ to, text: "Ocurrió un error al obtener las habitaciones.", token, phoneNumberId });
    }
  });
}

// === Start room reservation flow ===
export async function startRoomFlow({ to, token, phoneNumberId, pool, user, cfg }) {
  try {
    const chatId = digitsChatId(to);
    setState(chatId, { step: 'pick_room' });
    
    // Cancel any existing amenity drafts to avoid conflicts
    try {
      const existingDraft = await amenityGetLastDraft(pool, user.id);
      if (existingDraft) {
        await amenityCancel(pool, existingDraft.id);
        logger.info({ svc: 'room', step: 'start', action: 'cancelled_amenity_draft', draftId: existingDraft.id });
      }
    } catch (err) {
      logger.error({ svc: 'room', step: 'start', action: 'cancel_amenity_failed', error: err.message });
    }
    
    const hotelId = getHotelIdForReservations(user);
    
    logger.info({ 
      step: 'reserve_start', 
      userId: user.id,
      userHotelId: user?.hotel_id,
      hotelKey: hotel.key,
      usingHotelId: hotelId
    });
    
    // Use new pagination approach - start with page 0
    await sendRoomsPage({ to, token, phoneNumberId, pool, cfg, hotelId }, 0);
  } catch (err) {
    logger.error('startRoomFlow failed', { err: err?.response?.data || err?.message || err });
    await sendWhatsAppText({
      to,
      text: 'No pude iniciar la reserva en este momento. Inténtalo de nuevo.',
      token, phoneNumberId
    });
  }
}

// === Handle room button actions ===
export async function handleRoomButtons({ to, id, pool, user, token, phoneNumberId, cfg }) {
  // Handle "Ver más" images
  if (id.startsWith("room_more_")) {
    const m = /^room_more_(\d+)_page_(\d+)$/.exec(id);
    if (!m) return;
    const roomId = Number(m[1]);
    const page = Number(m[2]);

    const perPage = 3;
    const images = await getRoomImages(pool, roomId);
    
    if (!images.length) {
      await sendWhatsAppText({ to, text: "No hay más imágenes de esta habitación.", token, phoneNumberId });
      return;
    }

    // Skip the first image (main image) and paginate the rest
    const start = (page - 1) * perPage + 1;
    const slice = images.slice(start, start + perPage);

    if (!slice.length) {
      await sendWhatsAppText({ to, text: "No hay más imágenes.", token, phoneNumberId });
      return;
    }

    // Send each image in the slice
    for (const imagePath of slice) {
      const url = buildPublicUrl(cfg.BASE_MEDIA_URL, imagePath);
      if (url) {
        await sendWhatsAppImage({ to, imageUrl: url, caption: '', token, phoneNumberId });
      }
      await delay(500);
    }

    // Check if there are more pages
    const hasMore = start + perPage < images.length;
    if (hasMore) {
      await sendInteractiveButtons({
        to,
        body: '¿Ver más imágenes?',
        buttons: [{ id: `room_more_${roomId}_page_${page + 1}`, title: 'Ver más' }],
        token,
        phoneNumberId,
      });
    } else {
      await sendWhatsAppText({ to, text: 'No hay más imágenes.', token, phoneNumberId });
    }
    return;
  }

  // Handle room selection
  if (id.startsWith("reserve_pick_room_")) {
    if (!user) {
      await sendWhatsAppText({ to, text: "Sesión expirada.", token, phoneNumberId });
      return;
    }
    const parts = id.split("_");
    const roomId = parseInt(parts[3]);
    await handleRoomPick({ to, token, phoneNumberId, pool, roomId, user, cfg });
    return;
  }
}

// === Handle room pick ===
async function handleRoomPick({ to, token, phoneNumberId, pool, roomId, user, cfg }) {
  try {
    // Get room details including weekday prices
    const [roomRows] = await pool.execute(
      `SELECT id, room_number, type, price,
              price_monday, price_tuesday, price_wednesday, price_thursday, 
              price_friday, price_saturday, price_sunday
       FROM rooms WHERE id = ?`,
      [roomId]
    );
    const room = roomRows?.[0];
    if (!room) {
      await sendWhatsAppText({ to, text: "Habitación no encontrada.", token, phoneNumberId });
      return;
    }
    
    const chatId = digitsChatId(to);
    const hotelId = getHotelIdForReservations(user);
    
    // Store draft in memory state (not in database yet)
    setState(chatId, {
      step: user.email ? 'email_choice' : 'enter_email',
      roomId: room.id,
      roomNumber: room.room_number,
      roomType: room.type,
      roomPrice: Number(room.price) || 0,
      hotelId: hotelId,
      userId: user.id,
      userPhone: user.phone || null,
      userName: [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.first_name || ''
    });
    
    logger.info({ 
      step: 'reserve_pick_room', 
      roomId, 
      userId: user.id,
      hotelId 
    });
    
    // Check if user has email
    if (user.email) {
      await sendInteractiveButtons({
        to,
        body: `Ya tienes un correo asociado: *${user.email}*. ¿Quieres usarlo o escribir uno nuevo?`,
        buttons: [
          { id: 'reserve_email_use_old', title: 'Si, el mismo' },
          { id: 'reserve_email_new', title: 'Nuevo correo' }
        ],
        token,
        phoneNumberId
      });
    } else {
      await sendWhatsAppText({ 
        to, 
        text: "Escribe tu correo electrónico (ejemplo: usuario@dominio.com):", 
        token, 
        phoneNumberId 
      });
    }
  } catch (err) {
    logger.error("Error in handleRoomPick:", err);
    await sendWhatsAppText({ to, text: "Ocurrió un error al seleccionar la habitación.", token, phoneNumberId });
  }
}

// Note: digitsChatId is now imported from price.js
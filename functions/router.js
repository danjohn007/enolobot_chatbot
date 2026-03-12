// router.js - Message routing and webhook handling
import axios from "axios";
import { logger } from "./config.js";
import { getPool, getUserByPhone, normalizePhoneMX, amenityGetLastDraft, amenityCancel, cleanupRoomDraftsForGuest, getDraft, clearDraft } from "./db.js";
import { sendWhatsAppText, sendInteractiveButtons, sendInteractiveList } from "./wa.js";
import { 
  startRoomFlow, 
  handleRoomButtons, 
  handleHabitaciones,
  getState,
  setState,
  clearState
} from "./rooms.flow.js";
import { 
  startAmenityFlow, 
  handleAmenityButtons, 
  handleAmenityText,
  handleAmenidades
} from "./amenities.flow.js";
import { 
  startTablesFlow, 
  handleTableButtons, 
  handleTableText,
  handleMesas
} from "./tables.flow.js";
import {
  startServiceFlow,
  handleServiceButtons,
  handleServiceText
} from "./services.flow.js";
import { 
  showGuestMenu,
  handleGuestPostback
} from "./guest.flow.js";
import {
  startGuestTableFlow,
  handleGuestTablesText,
  handleGuestTablesPostback
} from "./guest_tables.flow.js";
import {
  startRegistration,
  handleRegistrationInput,
  cancelRegistration
} from "./register.flow.js";
import { 
  parseDMY2ToISO, 
  isValidEmail, 
  normalizeUserText, 
  diffNights, 
  formatDateDMY2, 
  formatMoneyMXN,
  digitsChatId
} from "./price.js";
import { hotel, getHotelIdForReservations } from "./hotelconfig.js";
import { isPastDateYMD, MSG_DATE_PAST, MX_TZ, parseDateInputWithRelative } from "./time_utils.js";

// === Menu functions ===
async function sendMenuPrincipal({ to, token, phoneNumberId, isGuest = false, firstName = '' }) {
  const menuRows = isGuest
    ? [
        { id: "main_reserve_room", title: "Reservar Habitación" },
        { id: "main_reserve_amen", title: "Reservar Amenidades" },
        { id: "main_reserve_table", title: "Reservar Mesas" },
        { id: "main_request_service", title: "Solicitar Servicios" },
      ]
    : [
        { id: "act_info", title: "Ver información" },
      ];
  
  // Use list for guest menu (4 options), buttons for non-guest (1 option)
  if (isGuest) {
    const greeting = firstName ? `Hola ${firstName} bienvenido` : "Hola";
    await sendInteractiveList({
      to,
      header: greeting,
      body: "Tienes diferentes opciones ¿Qué deseas hacer?",
      footer: "Selecciona aqui 👇",
      buttonText: "Elegir",
      rows: menuRows,
      token,
      phoneNumberId
    });
  } else {
    let bodyText;
    if (firstName) {
      const labelTemplate = hotel.labels.mainMenuNonGuest;
      bodyText = labelTemplate.replace('{name}', firstName);
    } else {
      bodyText = "Selecciona una opción:";
    }
    
    await sendInteractiveButtons({
      to,
      body: bodyText,
      buttons: menuRows,
      token,
      phoneNumberId
    });
  }
}

async function sendInfoMenu({ to, token, phoneNumberId }) {
  await sendInteractiveButtons({
    to,
    body: "Selecciona una opción:",
    buttons: [
      { id: "amenities", title: "Amenidades" },
      { id: "rooms", title: "Habitaciones" },
      { id: "tables", title: "Mesas" },
    ],
    token,
    phoneNumberId
  });
}

async function sendServiceMenu({ to, token, phoneNumberId }) {
  await sendInteractiveButtons({
    to,
    body: "Muy bien, ¿Cuál es el servicio que deseas usar?",
    buttons: [
      { id: 'svc_room', title: 'Reservar Habitación' },
      { id: 'svc_amenity', title: 'Reservar Amenidad' },
      { id: 'svc_table', title: 'Reservar Mesa' }
    ],
    token,
    phoneNumberId
  });
}

// === Room reservation helpers ===
async function promptCheckIn({ to, token, phoneNumberId }) {
  await sendWhatsAppText({
    to,
    text:
      "¿Desde cuándo es tu estancia?\n" +
      "Formato: *DD/MM/AA*\n" +
      "También puedes escribir *hoy* o *mañana*\n" +
      "Ejemplo: *12/10/25*",
    token, phoneNumberId
  });
}

async function promptCheckOut({ to, token, phoneNumberId, checkInIso }) {
  await sendWhatsAppText({
    to,
    text:
      `Perfecto. *Check-in:* ${formatDateDMY2(checkInIso)}\n` +
      "¿Hasta qué día te quedarás?\n" +
      "Formato: *DD/MM/AA* o escribe *hoy* / *mañana*\n" +
      "(debe ser posterior al check-in)",
    token, phoneNumberId
  });
}

async function handleEmailUseOld({ to, token, phoneNumberId, pool, user }) {
  try {
    const chatId = digitsChatId(to);
    const st = getState(chatId);
    
    if (!st?.roomId) {
      await sendWhatsAppText({ to, text: 'Tu sesión expiró. Escribe "hola" para comenzar de nuevo.', token, phoneNumberId });
      clearState(chatId);
      return;
    }
    
    setState(chatId, { ...st, step: 'checkin', email: user.email });
    
    logger.info({ step: 'reserve_email', userId: user.id, usedOld: true });
    
    await promptCheckIn({ to, token, phoneNumberId });
  } catch (err) {
    logger.error("Error in handleEmailUseOld:", err);
    await sendWhatsAppText({ to, text: "Ocurrió un error al guardar el email.", token, phoneNumberId });
  }
}

async function handleEmailNew({ to, token, phoneNumberId, pool }) {
  try {
    const chatId = digitsChatId(to);
    const st = getState(chatId);
    
    if (!st?.roomId) {
      await sendWhatsAppText({ to, text: 'Tu sesión expiró. Escribe "hola" para comenzar de nuevo.', token, phoneNumberId });
      clearState(chatId);
      return;
    }
    
    setState(chatId, { ...st, step: 'enter_email' });
    
    logger.info({ step: 'reserve_email', usedOld: false });
    
    await sendWhatsAppText({
      to,
      text: "Escribe tu correo electrónico (ejemplo: usuario@dominio.com):",
      token,
      phoneNumberId
    });
  } catch (err) {
    logger.error("Error in handleEmailNew:", err);
    await sendWhatsAppText({ to, text: "Ocurrió un error.", token, phoneNumberId });
  }
}

async function handleConfirm({ to, token, phoneNumberId, pool, user, cfg }) {
  try {
    const chatId = digitsChatId(to);
    const st = getState(chatId);
    
    if (!st?.roomId || !st?.email || !st?.checkIn || !st?.checkOut) {
      await sendWhatsAppText({ to, text: 'Tu sesión expiró. Escribe "hola" para comenzar de nuevo.', token, phoneNumberId });
      clearState(chatId);
      return;
    }
    
    logger.info({ step: 'reserve_confirm', userId: user.id, roomId: st.roomId });
    
    const guestName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.first_name || '';
    
    try {
      // Use new insertRoomReservationFinal with validation and overlap checking
      const { insertRoomReservationFinal } = await import('./db.js');
      const result = await insertRoomReservationFinal(pool, {
        hotel_id: st.hotelId || hotel.hotelId,
        room_id: st.roomId,
        user_id: user.id,
        phone: user.phone || null,
        guest_name: guestName,
        guest_email: st.email,
        checkin_date: st.checkIn,
        checkout_date: st.checkOut,
        total_price: st.total || 0,
        status: 'pending',
        notes: null
      });
      
      logger.info('[room_resv] confirmed', { 
        reservation_id: result.id, 
        user_id: user.id, 
        room_id: st.roomId 
      });
      
      // Clean up any old draft reservations
      await cleanupRoomDraftsForGuest(pool, user.id, null);
      
      clearState(chatId);
      
      await sendWhatsAppText({
        to,
        text: `✅ Reserva registrada exitosamente.\n\n📃Recibirás confirmación por medio de tu correo.\n\nSi deseas rentar una cabaña, envía la evidencia de este pago al WhatsApp 446 299 1900 para garantizar tu reservación.\n\nPuedes pagar usando el siguiente enlace: https://www.paypal.com/ncp/payment/EZJ22ZS2GXUNN \n\nEscribe *hola* para volver al inicio.`,
        token,
        phoneNumberId
      });
    } catch (err) {
      if (err.message === 'room_unavailable_range') {
        logger.error('[room_resv] confirm error: room unavailable', { user_id: user.id, room_id: st.roomId });
        await sendWhatsAppText({
          to,
          text: 'Lo sentimos, la habitación ya no está disponible para las fechas seleccionadas. Por favor, intenta con otras fechas.',
          token,
          phoneNumberId
        });
      } else {
        logger.error('[room_resv] confirm error', { err: String(err), user_id: user.id });
        await sendWhatsAppText({
          to,
          text: 'No pudimos confirmar en este momento. Intenta de nuevo.',
          token,
          phoneNumberId
        });
      }
      clearState(chatId);
    }
  } catch (err) {
    logger.error("Error in handleConfirm:", err);
    await sendWhatsAppText({ to, text: "Ocurrió un error al confirmar la reserva.", token, phoneNumberId });
  }
}

async function handleCancel({ to, token, phoneNumberId, pool, user }) {
  try {
    const chatId = digitsChatId(to);
    clearState(chatId);
    
    logger.info({ step: 'reserve_cancel', userId: user.id });
    
    await sendWhatsAppText({
      to,
      text: "Se canceló la operación. Escribe *hola* para volver al inicio.",
      token,
      phoneNumberId
    });
    
    await sendMenuPrincipal({ 
      to, 
      token, 
      phoneNumberId, 
      isGuest: (user.role || '').toLowerCase() === 'guest', 
      firstName: user.first_name 
    });
  } catch (err) {
    logger.error("Error in handleCancel:", err);
    await sendWhatsAppText({ to, text: "Ocurrió un error al cancelar.", token, phoneNumberId });
  }
}

// === Main webhook handler ===
export async function handleWebhook(req, res, cfg) {
  const pool = getPool(cfg);

  // Verificación GET
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === cfg.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  const body = req.body;
  logger.info("Webhook body", body);

  const statuses = body?.entry?.[0]?.changes?.[0]?.value?.statuses;
  if (Array.isArray(statuses) && statuses.length) return res.sendStatus(200);

  const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;
  const from = messages?.[0]?.from;
  if (!messages || !from) return res.sendStatus(200);

  const token = cfg.WHATSAPP_TOKEN;
  const phoneNumberId = cfg.WHATSAPP_PHONE_NUMBER_ID;
  const msg = messages[0];

  // === BUTTON REPLIES ===
  if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
    const payload = msg.interactive.button_reply.id;
    const title = msg.interactive.button_reply.title;
    
    logger.info({ svc: 'router', debug: 'button_in', id: payload, title });
    
    // Log incoming phone and normalized version
    const normPhone = normalizePhoneMX(from);
    logger.info({ svc: 'router', action: 'auth', raw: from, norm: normPhone });
    
    const user = await getUserByPhone(pool, from);
    
    // Handle guest menu actions (for non-registered users)
    if (payload.startsWith('guest:')) {
      const handled = await handleGuestPostback(
        { to: from, token, phoneNumberId, pool },
        payload
      );
      if (handled) return res.sendStatus(200);
    }
    
    // Handle guest amenity flow actions (for non-registered users)
    if (payload.startsWith('amenityg:')) {
      const { handleGuestAmenitiesPostback } = await import('./guest_amenities.flow.js');
      const handled = await handleGuestAmenitiesPostback(
        { to: from, token, phoneNumberId, pool, from },
        payload
      );
      if (handled) return res.sendStatus(200);
    }
    
    // Handle guest table flow actions (for non-registered users)
    if (payload.startsWith('tableg:')) {
      const handled = await handleGuestTablesPostback(
        { to: from, token, phoneNumberId, pool, from },
        payload
      );
      if (handled) return res.sendStatus(200);
    }
    
    // Handle registration flow actions
    if (payload.startsWith('register:')) {
      if (payload === 'register:start') {
        await startRegistration({ to: from, token, phoneNumberId, pool, from, user });
        return res.sendStatus(200);
      }
      
      if (payload === 'register:cancel') {
        await cancelRegistration({ to: from, token, phoneNumberId, pool, from, user });
        return res.sendStatus(200);
      }
      
      // Handle other registration actions (confirm, edit) - works for both users and non-users
      await handleRegistrationInput(
        { to: from, token, phoneNumberId, pool, from, user },
        payload
      );
      return res.sendStatus(200);
    }
    
    // Main menu actions
    if (payload === "act_info") {
      await sendInfoMenu({ to: from, token, phoneNumberId, pool });
      return res.sendStatus(200);
    }
    
    // New main menu buttons for 3-option flow
    if (payload === "main_reserve_room") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "No te encuentras en el sistema.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      if ((user.role || '').toLowerCase() !== 'guest') {
        await sendWhatsAppText({ to: from, text: 'Esta opción es solo para huéspedes.', token, phoneNumberId });
        return res.sendStatus(200);
      }
      await startRoomFlow({ to: from, token, phoneNumberId, pool, user, cfg });
      return res.sendStatus(200);
    }
    
    if (payload === "main_reserve_amen") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "No te encuentras en el sistema.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      if ((user.role || '').toLowerCase() !== 'guest') {
        await sendWhatsAppText({ to: from, text: 'Esta opción es solo para huéspedes.', token, phoneNumberId });
        return res.sendStatus(200);
      }
      await startAmenityFlow({ to: from, token, phoneNumberId, pool, user });
      return res.sendStatus(200);
    }
    
    if (payload === "main_reserve_table") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "No te encuentras en el sistema.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      await startTablesFlow({ to: from, pool, user, token, phoneNumberId });
      return res.sendStatus(200);
    }
    
    if (payload === "main_request_service") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "No te encuentras en el sistema.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      if ((user.role || '').toLowerCase() !== 'guest') {
        await sendWhatsAppText({ to: from, text: 'Esta opción es solo para huéspedes.', token, phoneNumberId });
        return res.sendStatus(200);
      }
      await startServiceFlow({ to: from, pool, user, token, phoneNumberId });
      return res.sendStatus(200);
    }
    
    // Legacy actions
    if (payload === "act_reservar") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "No te encuentras en el sistema.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      if ((user.role || '').toLowerCase() !== 'guest') {
        await sendWhatsAppText({ to: from, text: 'Esta opción es solo para huéspedes.', token, phoneNumberId });
        return res.sendStatus(200);
      }
      await startRoomFlow({ to: from, token, phoneNumberId, pool, user, cfg });
      return res.sendStatus(200);
    }
    
    // Service menu
    if (payload === "svc_menu") {
      await sendServiceMenu({ to: from, token, phoneNumberId, pool });
      return res.sendStatus(200);
    }
    
    if (payload === "svc_room") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "No te encuentras en el sistema.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      if ((user.role || '').toLowerCase() !== 'guest') {
        await sendWhatsAppText({ to: from, text: 'Esta opción es solo para huéspedes.', token, phoneNumberId });
        return res.sendStatus(200);
      }
      await startRoomFlow({ to: from, token, phoneNumberId, pool, user, cfg });
      return res.sendStatus(200);
    }
    
    if (payload === "svc_amenity") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "No te encuentras en el sistema.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      if ((user.role || '').toLowerCase() !== 'guest') {
        await sendWhatsAppText({ to: from, text: 'Esta opción es solo para huéspedes.', token, phoneNumberId });
        return res.sendStatus(200);
      }
      await startAmenityFlow({ to: from, token, phoneNumberId, pool, user });
      return res.sendStatus(200);
    }
    
    if (payload === "svc_table") {
      await sendWhatsAppText({ to: from, text: "Esta funcionalidad estará disponible pronto.", token, phoneNumberId });
      return res.sendStatus(200);
    }
    
    // Info menu actions
    if (payload === "amenities") {
      await handleAmenidades({ to: from, token, phoneNumberId, pool, cfg });
      return res.sendStatus(200);
    }
    
    if (payload === "rooms") {
      await handleHabitaciones({ to: from, token, phoneNumberId, pool, cfg });
      return res.sendStatus(200);
    }
    
    if (payload === "tables") {
      await handleMesas({ to: from, token, phoneNumberId, pool, cfg });
      return res.sendStatus(200);
    }
    
    // Room reservation buttons
    if (payload === "reserve_email_use_old") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "Sesión expirada.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      await handleEmailUseOld({ to: from, token, phoneNumberId, pool, user });
      return res.sendStatus(200);
    }
    
    if (payload === "reserve_email_new") {
      await handleEmailNew({ to: from, token, phoneNumberId, pool });
      return res.sendStatus(200);
    }
    
    if (payload === "reserve_confirm") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "Sesión expirada.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      await handleConfirm({ to: from, token, phoneNumberId, pool, user, cfg });
      return res.sendStatus(200);
    }
    
    if (payload === "reserve_cancel") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "Sesión expirada.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      await handleCancel({ to: from, token, phoneNumberId, pool, user });
      return res.sendStatus(200);
    }
    
    // Handle rooms postback (pagination)
    if (payload.startsWith('rooms:')) {
      const hotelId = user ? getHotelIdForReservations(user) : hotel.hotelId;
      const { handleRoomsPostback } = await import('./rooms.flow.js');
      const handled = await handleRoomsPostback(
        { to: from, token, phoneNumberId, pool, cfg, hotelId },
        payload
      );
      if (handled !== false) return res.sendStatus(200);
    }
    
    // Delegate to flow handlers
    await handleRoomButtons({ to: from, id: payload, pool, user, token, phoneNumberId, cfg });
    await handleAmenityButtons({ to: from, id: payload, pool, user, token, phoneNumberId });
    
    // Handle table buttons (table_ prefix as per issue spec)
    if (payload.startsWith('table_')) {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "Sesión expirada.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      const handled = await handleTableButtons({ to: from, id: payload, pool, user, token, phoneNumberId });
      if (handled) return res.sendStatus(200);
    }
    
    await handleServiceButtons({ to: from, id: payload, pool, user, token, phoneNumberId });
    
    return res.sendStatus(200);
  }

  // === LIST REPLIES ===
  if (msg.type === "interactive" && msg.interactive?.type === "list_reply") {
    const payload = msg.interactive.list_reply.id;
    const title = msg.interactive.list_reply.title;
    
    logger.info({ svc: 'router', debug: 'list_in', id: payload, title });
    
    // Log incoming phone and normalized version
    const normPhone = normalizePhoneMX(from);
    logger.info({ svc: 'router', action: 'auth', raw: from, norm: normPhone });
    
    const user = await getUserByPhone(pool, from);
    
    // Handle guest menu actions (for non-registered users)
    if (payload.startsWith('guest:')) {
      const handled = await handleGuestPostback(
        { to: from, token, phoneNumberId, pool },
        payload
      );
      if (handled) return res.sendStatus(200);
    }
    
    // Handle guest amenity flow actions (for non-registered users)
    if (payload.startsWith('amenityg:')) {
      const { handleGuestAmenitiesPostback } = await import('./guest_amenities.flow.js');
      const handled = await handleGuestAmenitiesPostback(
        { to: from, token, phoneNumberId, pool, from },
        payload
      );
      if (handled) return res.sendStatus(200);
    }
    
    // Handle guest table flow actions (for non-registered users)
    if (payload.startsWith('tableg:')) {
      const handled = await handleGuestTablesPostback(
        { to: from, token, phoneNumberId, pool, from },
        payload
      );
      if (handled) return res.sendStatus(200);
    }
    
    // Handle registration flow actions
    if (payload.startsWith('register:')) {
      if (payload === 'register:start') {
        await startRegistration({ to: from, token, phoneNumberId, pool, from, user });
        return res.sendStatus(200);
      }
    }
    
    // Main menu list actions (guest menu with 4 options)
    if (payload === "main_reserve_room") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "No te encuentras en el sistema.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      if ((user.role || '').toLowerCase() !== 'guest') {
        await sendWhatsAppText({ to: from, text: 'Esta opción es solo para huéspedes.', token, phoneNumberId });
        return res.sendStatus(200);
      }
      await startRoomFlow({ to: from, token, phoneNumberId, pool, user, cfg });
      return res.sendStatus(200);
    }
    
    if (payload === "main_reserve_amen") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "No te encuentras en el sistema.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      if ((user.role || '').toLowerCase() !== 'guest') {
        await sendWhatsAppText({ to: from, text: 'Esta opción es solo para huéspedes.', token, phoneNumberId });
        return res.sendStatus(200);
      }
      await startAmenityFlow({ to: from, token, phoneNumberId, pool, user });
      return res.sendStatus(200);
    }
    
    if (payload === "main_reserve_table") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "No te encuentras en el sistema.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      await startTablesFlow({ to: from, pool, user, token, phoneNumberId });
      return res.sendStatus(200);
    }
    
    if (payload === "main_request_service") {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "No te encuentras en el sistema.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      if ((user.role || '').toLowerCase() !== 'guest') {
        await sendWhatsAppText({ to: from, text: 'Esta opción es solo para huéspedes.', token, phoneNumberId });
        return res.sendStatus(200);
      }
      await startServiceFlow({ to: from, pool, user, token, phoneNumberId });
      return res.sendStatus(200);
    }
    
    // Handle rooms postback (pagination) for list replies
    if (payload.startsWith('rooms:')) {
      const hotelId = user ? getHotelIdForReservations(user) : hotel.hotelId;
      const { handleRoomsPostback } = await import('./rooms.flow.js');
      const handled = await handleRoomsPostback(
        { to: from, token, phoneNumberId, pool, cfg, hotelId },
        payload
      );
      if (handled !== false) return res.sendStatus(200);
    }
    
    // Delegate to flow handlers (for any other list replies used in flows)
    await handleRoomButtons({ to: from, id: payload, pool, user, token, phoneNumberId, cfg });
    await handleAmenityButtons({ to: from, id: payload, pool, user, token, phoneNumberId });
    
    // Handle table buttons (table_ prefix)
    if (payload.startsWith('table_')) {
      if (!user) {
        await sendWhatsAppText({ to: from, text: "Sesión expirada.", token, phoneNumberId });
        return res.sendStatus(200);
      }
      const handled = await handleTableButtons({ to: from, id: payload, pool, user, token, phoneNumberId });
      if (handled) return res.sendStatus(200);
    }
    
    await handleServiceButtons({ to: from, id: payload, pool, user, token, phoneNumberId });
    
    return res.sendStatus(200);
  }

  // === TEXT MESSAGES ===
  if (msg.type === "text") {
    const txt = msg.text.body.trim();
    const txtLower = txt.toLowerCase();
    
    if (txtLower === "hola") {
      // Log incoming phone and normalized version
      const normPhone = normalizePhoneMX(from);
      logger.info({ svc: 'router', action: 'auth', raw: from, norm: normPhone });
      
      const user = await getUserByPhone(pool, from);
      
      // Clean up any existing drafts if user exists
      if (user) {
        // Clean up any existing amenity draft
        const existingAmenityDraft = await amenityGetLastDraft(pool, user.id);
        if (existingAmenityDraft) {
          await amenityCancel(pool, existingAmenityDraft.id);
          logger.info({ svc: 'hola', action: 'cancelled_amenity_draft', draftId: existingAmenityDraft.id, userId: user.id });
        }
        
        // Clean up any existing draft (table_flow, etc.)
        await clearDraft(pool, user.id);
        logger.info({ svc: 'hola', action: 'cleared_draft', userId: user.id });
        
        // Clean up any existing room reservation state
        const chatId = digitsChatId(from);
        clearState(chatId);
        logger.info({ svc: 'hola', action: 'cleared_room_state', userId: user.id, chatId });
      }
      
      // If user doesn't exist, show guest menu for registration
      if (!user) {
        // Clean up any guest amenity draft for non-registered users
        try {
          await pool.execute(
            `DELETE FROM user_drafts WHERE svc LIKE 'amenity_guest_%' AND user_id = 0`
          );
          logger.info({ svc: 'hola', action: 'cleared_guest_amenity_draft', phone: from });
        } catch (err) {
          logger.error({ svc: 'hola', action: 'clear_guest_draft_error', err: err.message });
        }
        
        await showGuestMenu({ to: from, token, phoneNumberId, pool });
        return res.sendStatus(200);
      }
      
      // Show menu for registered users
      const isGuest = user?.role === 'guest';
      await sendMenuPrincipal({ 
        to: from, 
        token, 
        phoneNumberId, 
        isGuest, 
        firstName: user?.first_name || '' 
      });
      return res.sendStatus(200);
    }
    
    // Check for reservation flow text inputs
    // Log incoming phone and normalized version
    const normPhone = normalizePhoneMX(from);
    logger.info({ svc: 'router', action: 'auth', raw: from, norm: normPhone });
    
    const user = await getUserByPhone(pool, from);
    
    // Check for registration flow text input (works for both users and non-users)
    // We need to import getRegistrationState but it's not exported
    // Instead, let's check if this could be registration input
    // For now, we'll handle this by checking getDraft first if user exists
    if (user) {
      const regDraft = await getDraft(pool, user.id);
      if (regDraft && regDraft.svc === 'register') {
        await handleRegistrationInput(
          { to: from, token, phoneNumberId, pool, from, user },
          txt
        );
        return res.sendStatus(200);
      }
    } else {
      // For non-users, we need to check in-memory registration state
      // We'll need to expose a helper from register.flow to check this
      // For now, we'll try to handle it by calling handleRegistrationInput
      // which will check internally
      const { isInRegistrationFlow } = await import('./register.flow.js');
      if (await isInRegistrationFlow(from)) {
        await handleRegistrationInput(
          { to: from, token, phoneNumberId, pool, from, user: null },
          txt
        );
        return res.sendStatus(200);
      }
      
      // Check for guest amenity flow (for non-registered users)
      const { handleGuestAmenitiesText } = await import('./guest_amenities.flow.js');
      const handledGuestAmen = await handleGuestAmenitiesText(
        { to: from, token, phoneNumberId, pool, from },
        txt
      );
      if (handledGuestAmen) return res.sendStatus(200);
      
      // Check for guest table flow (for non-registered users)
      const handledGuestTable = await handleGuestTablesText(
        { to: from, token, phoneNumberId, pool, from },
        txt
      );
      if (handledGuestTable) return res.sendStatus(200);
    }
    
    if (user) {
      // Check draft-based flows first (tables uses draft)
      const draft = await getDraft(pool, user.id);
      
      // Check table flow (draft-based)
      if (draft && draft.svc === 'table_flow') {
        logger.info({ svc: 'router', flow: 'table_flow', step: draft.step, waiting: draft.waiting, userId: user.id });
        const handled = await handleTableText({ to: from, text: txt, pool, user, token, phoneNumberId });
        if (handled) return res.sendStatus(200);
      }
      
      // Check for amenity flow (takes priority if draft exists)
      const handledAmen = await handleAmenityText({ to: from, text: txt, pool, user, token, phoneNumberId });
      if (handledAmen) return res.sendStatus(200);
      
      // Check service flow
      const handledSrv = await handleServiceText({ to: from, text: txt, pool, user, token, phoneNumberId });
      if (handledSrv) return res.sendStatus(200);
      
      // Check room reservation flow
      const chatId = digitsChatId(from);
      const st = getState(chatId);
      
      if (st) {
        // Handle email input
        if (st.step === 'enter_email') {
          logger.info({ step: 'reserve_email', userId: user.id, usedOld: false });
          
          if (!isValidEmail(txt)) {
            await sendWhatsAppText({
              to: from,
              text: "El email no es válido. Por favor, escribe un email con formato correcto (usuario@dominio.com):",
              token,
              phoneNumberId,
            });
            return res.sendStatus(200);
          }
          
          setState(chatId, { ...st, step: 'checkin', email: txt });
          
          await promptCheckIn({ to: from, token, phoneNumberId, pool });
          return res.sendStatus(200);
        }
        
        // Handle check-in
        if (st.step === 'checkin') {
          // Try parsing with relative dates support
          let iso = parseDateInputWithRelative(txt, MX_TZ);
          if (!iso) {
            // Fallback to old parser
            iso = parseDMY2ToISO(txt);
          }
          
          if (!iso) {
            await sendWhatsAppText({
              to: from,
              text: "Formato inválido. Escribe la fecha de *Check-in* como *DD/MM/AA* o usa *hoy* / *mañana* (ej. 12/10/25).",
              token, phoneNumberId
            });
            return res.sendStatus(200);
          }
          
          // Validate date is not in the past
          if (isPastDateYMD(iso, MX_TZ)) {
            await sendWhatsAppText({ to: from, text: MSG_DATE_PAST(), token, phoneNumberId });
            await promptCheckIn({ to: from, token, phoneNumberId, pool });
            return res.sendStatus(200);
          }

          setState(chatId, { ...st, step: 'checkout', checkIn: iso });
          await promptCheckOut({ to: from, token, phoneNumberId, checkInIso: iso });
          return res.sendStatus(200);
        }

        // Handle check-out
        if (st.step === 'checkout') {
          // Try parsing with relative dates support
          let outIso = parseDateInputWithRelative(txt, MX_TZ);
          if (!outIso) {
            // Fallback to old parser
            outIso = parseDMY2ToISO(txt);
          }
          
          if (!outIso) {
            await sendWhatsAppText({
              to: from,
              text: "Formato inválido. Escribe la fecha de *Check-out* como *DD/MM/AA* o usa *hoy* / *mañana* (ej. 20/10/25).",
              token, phoneNumberId
            });
            return res.sendStatus(200);
          }
          
          // Validate date is not in the past
          if (isPastDateYMD(outIso, MX_TZ)) {
            await sendWhatsAppText({ to: from, text: MSG_DATE_PAST(), token, phoneNumberId });
            await promptCheckOut({ to: from, token, phoneNumberId, checkInIso: st.checkIn });
            return res.sendStatus(200);
          }

          const inIso = st.checkIn;
          
          // Validate check-out > check-in (string comparison is safe for ISO YYYY-MM-DD format)
          // Same-date booking is not allowed (must be at least 1 night)
          if (outIso <= inIso) {
            await sendWhatsAppText({
              to: from,
              text: `La fecha de salida debe ser posterior al check-in (${formatDateDMY2(inIso)}). Intenta de nuevo.`,
              token, phoneNumberId
            });
            return res.sendStatus(200);
          }
          
          const nights = diffNights(inIso, outIso);
          const price = Number(st.roomPrice) || 0;
          const total = price * nights;

          logger.info({ step: 'reserve_dates', check_in: inIso, check_out: outIso, nights, total });

          const resumen =
            `*Muy bien ${user.first_name}, estos son tus datos de reserva:*\n\n` +
            `*A nombre de:* ${user.first_name} ${user.last_name || ''}\n` +
            `*Habitación:* ${st.roomNumber} (${st.roomType})\n` +
            `*Del:* ${formatDateDMY2(inIso)}  ⇨  *Hasta:* ${formatDateDMY2(outIso)}\n` +
            `*Noches:* ${nights}\n` +
            `*Precio por noche:* ${formatMoneyMXN(price)}   *Total:* ${formatMoneyMXN(total)}`;

          setState(chatId, { 
            ...st, 
            step: 'confirm',
            checkIn: inIso, 
            checkOut: outIso,
            nights, 
            total 
          });

          await sendWhatsAppText({ to: from, text: resumen, token, phoneNumberId });

          await sendInteractiveButtons({
            to: from,
            body: "¿Confirmas tu reserva?",
            buttons: [
              { id: 'reserve_confirm', title: 'Confirmar' },
              { id: 'reserve_cancel',  title: 'Cancelar'  }
            ],
            token, phoneNumberId
          });
          return res.sendStatus(200);
        }
      }
    }
    
    // Fallback
    await sendWhatsAppText({
      to: from,
      text: 'Escribe "hola" para comenzar.',
      token,
      phoneNumberId,
    });
    return res.sendStatus(200);
  }

  return res.sendStatus(200);
}
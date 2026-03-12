// services.flow.js - Service request flow
import { logger } from './config.js';
import { sendWhatsAppText, sendInteractiveButtons } from './wa.js';
import { 
  listActiveServiceTypes, 
  getServiceTypeById, 
  getLastRoomLabelForUser,
  getLastGuestContact,
  insertServiceRequest
} from './db.js';
import { getHotelIdForReservations } from './hotelconfig.js';

// In-memory draft storage for service requests
const serviceDrafts = new Map(); // { userId -> { serviceTypeId, serviceName, roomNumber, hotelId, guestId, description } }

export async function startServiceFlow({ to, pool, user, token, phoneNumberId }) {
  try {
    logger.info({ svc: 'service', step: 'start', userId: user?.id });

    const hotelId = getHotelIdForReservations(user);

    // Show service types catalog
    await showServiceTypesPage({ to, pool, page: 1, hotelId, token, phoneNumberId });
  } catch (err) {
    logger.error({ svc: 'service', step: 'start', error: err?.message || err });
    await sendWhatsAppText({ 
      to, 
      text: 'No pude iniciar la solicitud de servicio. Intenta más tarde.',
      token,
      phoneNumberId
    });
  }
}

async function showServiceTypesPage({ to, pool, page, hotelId, token, phoneNumberId }) {
  const perPage = 5;
  const offset = (page - 1) * perPage;
  // Fetch N+1 items to determine if there are more pages without a separate count query
  const rows = await listActiveServiceTypes(pool, hotelId, perPage + 1, offset);

  logger.info({ svc: 'service', step: 'types_page', page, count: rows.length });

  if (!rows.length && page === 1) {
    await sendWhatsAppText({ 
      to, 
      text: 'No hay servicios disponibles por ahora.',
      token,
      phoneNumberId
    });
    return;
  }
  if (!rows.length) {
    await sendWhatsAppText({ 
      to, 
      text: 'No hay más tipos de servicio.',
      token,
      phoneNumberId
    });
    return;
  }

  // Check if there are more pages
  const hasMore = rows.length > perPage;
  const itemsToShow = hasMore ? rows.slice(0, perPage) : rows;

  for (const st of itemsToShow) {
    const body = `*${st.name}*\n${st.description || ''}`;
    await sendInteractiveButtons({
      to,
      body,
      buttons: [{ id: `srv_pick_${st.id}`, title: 'Elegir este' }],
      token,
      phoneNumberId
    });
  }

  // Only show "Ver más" button if there are actually more pages
  if (hasMore) {
    await sendInteractiveButtons({
      to,
      body: '¿Quieres ver más tipos de servicio?',
      buttons: [{ id: `srv_types_page_${page + 1}`, title: 'Ver más' }],
      token,
      phoneNumberId
    });
  }
}

// Manejo de botones del flujo
export async function handleServiceButtons({ to, id, pool, user, token, phoneNumberId }) {
  // Handle pagination
  if (id.startsWith('srv_types_page_')) {
    const m = /^srv_types_page_(\d+)$/.exec(id);
    const page = Number(m?.[1] || 1);
    const hotelId = getHotelIdForReservations(user);
    await showServiceTypesPage({ to, pool, page, hotelId, token, phoneNumberId });
    return;
  }

  // Handle service selection "Elegir este"
  if (id.startsWith('srv_pick_')) {
    const serviceTypeId = Number(id.replace('srv_pick_', ''));
    const hotelId = getHotelIdForReservations(user);
    
    // Get service type info
    const serviceType = await getServiceTypeById(pool, serviceTypeId);
    if (!serviceType) {
      await sendWhatsAppText({
        to,
        text: 'Ese tipo de servicio no está disponible.',
        token,
        phoneNumberId
      });
      return;
    }

    // Get last room label for user
    const roomLabel = await getLastRoomLabelForUser(pool, { userId: user?.id, hotelId });
    if (!roomLabel) {
      await sendWhatsAppText({
        to,
        text: 'No encuentro una habitación asociada a tu última reserva. Parece que no estás hospedado ahora mismo.',
        token,
        phoneNumberId
      });
      return;
    }

    // Get guest contact information
    const { guest_email, guest_phone } = await getLastGuestContact(pool, user?.id);

    // Create draft
    const draft = {
      serviceTypeId,
      serviceName: serviceType.name,
      roomLabel,
      hotelId,
      guestId: user?.id,
      description: null,
      guest_email,
      guest_phone,
    };
    serviceDrafts.set(user?.id, draft);

    logger.info({ svc: 'service', step: 'pick', serviceTypeId, userId: user?.id, roomLabel: draft.roomLabel });

    await sendWhatsAppText({
      to,
      text: `Muy bien, has elegido el servicio de *${draft.serviceName}* para tu habitación *${draft.roomLabel}*.\n\n` +
            `Cuéntanos brevemente lo que necesitas (o responde *"Listo"* si no quieres agregar descripción).`,
      token,
      phoneNumberId
    });
    return;
  }

  // Handle confirmation buttons
  if (id === 'srv_confirm' || id === 'srv_cancel') {
    await handleServiceConfirm({ to, id, pool, user, token, phoneNumberId });
    return;
  }
}

// Manejo de texto (descripción) 
export async function handleServiceText({ to, text, pool, user, token, phoneNumberId }) {
  const userId = user?.id;
  const draft = serviceDrafts.get(userId);
  
  if (!draft) return false; // No draft, ignore

  const t = (text || '').trim();
  
  // If user writes "Listo", leave description as null
  const desc = t.toLowerCase() === 'listo' ? null : t;
  draft.description = desc;

  logger.info({ svc: 'service', step: 'desc', userId, description: desc ? 'provided' : 'skipped' });

  // Show summary + confirmation buttons
  await sendInteractiveButtons({
    to,
    body: `¿Confirmas tu solicitud?\n\n` +
          `Servicio: *${draft.serviceName}*\n` +
          `Habitación: *${draft.roomLabel}*\n` +
          (desc ? `Descripción: ${desc}\n` : ''),
    buttons: [
      { id: 'srv_confirm', title: 'Confirmar' },
      { id: 'srv_cancel',  title: 'Cancelar' },
    ],
    token,
    phoneNumberId
  });

  return true;
}

// Manejo de confirmación/cancelación
export async function handleServiceConfirm({ to, id, pool, user, token, phoneNumberId }) {
  const userId = user?.id;
  const draft = serviceDrafts.get(userId);
  
  if (!draft) {
    await sendWhatsAppText({
      to,
      text: 'No hay nada por confirmar.',
      token,
      phoneNumberId
    });
    return;
  }

  // Cancel
  if (id === 'srv_cancel') {
    serviceDrafts.delete(userId);
    logger.info({ svc: 'service', step: 'cancel', userId });
    await sendWhatsAppText({
      to,
      text: 'Solicitud cancelada. ¿Necesitas algo más?',
      token,
      phoneNumberId
    });
    return;
  }

  // Confirm
  if (id === 'srv_confirm') {
    const newId = await insertServiceRequest(pool, {
      hotelId: draft.hotelId,
      guestId: draft.guestId,
      serviceTypeId: draft.serviceTypeId,
      description: draft.description,
      roomNumber: draft.roomLabel,
    });

    serviceDrafts.delete(userId);
    
    logger.info({ 
      svc: 'service', 
      step: 'confirmed', 
      reqId: newId, 
      serviceTypeId: draft.serviceTypeId,
      userId 
    });

    await sendWhatsAppText({
      to,
      text: `¡Listo! Registré tu solicitud (#${newId}). Nuestro equipo te contactará en breve.`,
      token,
      phoneNumberId
    });
    return;
  }
}
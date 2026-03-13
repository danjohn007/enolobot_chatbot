// vineyard_reservation.flow.js - Vineyard reservation flow
import { logger } from "./config.js";
import { 
  sendWhatsAppText, 
  sendInteractiveButtons,
  delay
} from "./wa.js";
import { 
  createVineyardReservationDraft,
  getVineyardReservationDraft,
  updateVineyardReservationDraft,
  confirmVineyardReservation,
  cancelVineyardReservationDraft
} from "./db.js";
import { normalizeUserText, isValidEmail, formatDateDMY2 } from "./price.js";
import { parseDateInputWithRelative, formatISOasDMY, MX_TZ, isPastDateYMD, MSG_DATE_PAST } from "./time_utils.js";

// === Start vineyard reservation flow ===
export async function startVineyardReservationFlow({ to, token, phoneNumberId, pool }) {
  try {
    logger.info({ svc: 'vineyard_reservation', step: 'start', to });
    
    // Create draft
    const draft = await createVineyardReservationDraft(pool, { 
      phone: to, 
      step: 'awaiting_name' 
    });
    
    await sendWhatsAppText({
      to,
      text: "¿Con quién tengo el gusto (Nombre y apellido)?",
      token,
      phoneNumberId
    });
    
    return true;
  } catch (err) {
    logger.error('startVineyardReservationFlow failed', { err: err.message });
    await sendWhatsAppText({
      to,
      text: 'Ocurrió un error. Intenta de nuevo.',
      token,
      phoneNumberId
    });
  }
}

// === Handle vineyard reservation text input ===
export async function handleVineyardReservationText({ to, text, pool, token, phoneNumberId }) {
  try {
    const draft = await getVineyardReservationDraft(pool, to);
    if (!draft) return false;
    
    const step = draft.step || '';
    logger.info({ svc: 'vineyard_reservation', step, text: normalizeUserText(text) });
    
    // Step: awaiting_name
    if (step === 'awaiting_name') {
      const name = normalizeUserText(text);
      if (!name || name.length < 3) {
        await sendWhatsAppText({
          to,
          text: "Por favor, escribe tu nombre completo.",
          token,
          phoneNumberId
        });
        return true;
      }
      
      await updateVineyardReservationDraft(pool, draft.id, { 
        customer_name: name,
        step: 'awaiting_party_size'
      });
      
      await sendWhatsAppText({
        to,
        text: `Mucho gusto ${name}\n¿Para cuántas personas deseas reservar?`,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    // Step: awaiting_party_size
    if (step === 'awaiting_party_size') {
      const digits = String(text || '').match(/\d+/);
      const n = digits ? Number(digits[0]) : NaN;
      
      if (!Number.isInteger(n) || n < 1) {
        await sendWhatsAppText({
          to,
          text: "Por favor, indica un número válido de personas (mínimo 1).",
          token,
          phoneNumberId
        });
        return true;
      }
      
      await updateVineyardReservationDraft(pool, draft.id, { 
        party_size: n,
        step: 'awaiting_date'
      });
      
      await sendWhatsAppText({
        to,
        text: "¿Qué día quieres hacer la reservación?\nFormato: *DD/MM/YYYY*\nTambién puedes escribir *hoy* o *mañana*",
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    // Step: awaiting_date
    if (step === 'awaiting_date') {
      const iso = parseDateInputWithRelative(text, MX_TZ);
      if (!iso) {
        await sendWhatsAppText({
          to,
          text: "Formato inválido. Usa *DD/MM/YYYY*, o escribe *hoy* / *mañana*.\nEjemplo: *15/03/2026*",
          token,
          phoneNumberId
        });
        return true;
      }
      
      // Validate date is not in the past
      if (isPastDateYMD(iso, MX_TZ)) {
        await sendWhatsAppText({ to, text: MSG_DATE_PAST(), token, phoneNumberId });
        return true;
      }
      
      await updateVineyardReservationDraft(pool, draft.id, { 
        reservation_date: iso,
        step: 'awaiting_space'
      });
      
      await sendWhatsAppText({
        to,
        text: `Fecha: *${formatISOasDMY(iso)}*\n\nTenemos disponibles estos espacios:`,
        token,
        phoneNumberId
      });
      
      await sendInteractiveButtons({
        to,
        body: "Selecciona el espacio:",
        buttons: [
          { id: 'vineyard_space_restaurant', title: 'Restaurante' },
          { id: 'vineyard_space_lounge', title: 'Zona Lounge' }
        ],
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    // Step: awaiting_email
    if (step === 'awaiting_email') {
      const email = normalizeUserText(text);
      if (!isValidEmail(email)) {
        await sendWhatsAppText({
          to,
          text: "Correo inválido. Por favor, escribe un email válido (ejemplo: usuario@dominio.com):",
          token,
          phoneNumberId
        });
        return true;
      }
      
      await updateVineyardReservationDraft(pool, draft.id, { 
        email,
        step: 'completed'
      });
      
      // Confirm reservation
      await confirmVineyardReservation(pool, draft.id);
      
      const summary = 
        `✅ *RESUMEN DE RESERVACIÓN*\n\n` +
        `*Cliente:* ${draft.customer_name}\n` +
        `*Fecha:* ${formatISOasDMY(draft.reservation_date)}\n` +
        `*Personas:* ${draft.party_size}\n` +
        `*Espacio:* ${draft.space_type || 'N/A'}\n` +
        `*Email:* ${email}\n\n` +
        `*¿Cómo llegar?*\n` +
        `https://maps.app.goo.gl/NYNzXRZksqTfhh83A\n\n` +
        `Hemos enviado un email, confírmanos y tu lugar está garantizado. 🍷`;
      
      await sendWhatsAppText({
        to,
        text: summary,
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    return false;
  } catch (err) {
    logger.error('handleVineyardReservationText failed', { err: err.message });
    return false;
  }
}

// === Handle vineyard reservation buttons ===
export async function handleVineyardReservationButtons({ to, id, pool, token, phoneNumberId }) {
  try {
    const draft = await getVineyardReservationDraft(pool, to);
    if (!draft) return false;
    
    logger.info({ svc: 'vineyard_reservation', button: id });
    
    // Space selection
    if (id === 'vineyard_space_restaurant') {
      await updateVineyardReservationDraft(pool, draft.id, {
        space_type: 'Restaurante',
        step: 'awaiting_email'
      });
      
      await sendWhatsAppText({
        to,
        text: "Has seleccionado: *Restaurante*\n\nCompártenos un correo para enviarte la liga de confirmación:",
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    if (id === 'vineyard_space_lounge') {
      await updateVineyardReservationDraft(pool, draft.id, {
        space_type: 'Zona Lounge',
        step: 'awaiting_email'
      });
      
      await sendWhatsAppText({
        to,
        text: "Has seleccionado: *Zona Lounge*\n\nCompártenos un correo para enviarte la liga de confirmación:",
        token,
        phoneNumberId
      });
      
      return true;
    }
    
    return false;
  } catch (err) {
    logger.error('handleVineyardReservationButtons failed', { err: err.message });
    return false;
  }
}
